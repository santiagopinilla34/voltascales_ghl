"use server";

import { revalidatePath } from "next/cache";

import { countBookings, getCalendarById, slugify } from "@/lib/booking/calendars";
import {
  listAvailabilityRules,
  listBlockedDates,
  listBusyBookings,
} from "@/lib/booking/queries";
import { createOneTimeLink } from "@/lib/booking/one-time-links";
import { dayOfWeekOf, parseTimeOfDay, zonedTimeToUtc } from "@/lib/booking/time";
import { appBaseUrl } from "@/lib/env";
import { normalizePhone } from "@/lib/phone/normalize";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything the Calendar settings screens write.
 *
 * Every action re-checks the session. Server Actions are reachable by direct
 * POST rather than only through the form that renders them, and `/book` runs
 * unauthenticated through the same proxy — the guard there is not the only
 * thing between the internet and these writes.
 *
 * Organization is taken from `requireOrgContext()` and written explicitly, not
 * left to the column default. With a session the default does not raise, it
 * returns the caller's single membership — which for a platform admin is the
 * agency even while they are looking at a client, so a client's calendar would
 * be created under the agency.
 */

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Postgres unique violation: a slug or group name already in use. */
const UNIQUE_VIOLATION = "23505";
/** Foreign key violation: something still points at the row being deleted. */
const FK_VIOLATION = "23503";

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? supabase : null;
}

/** The three places a calendar change can show up. */
function revalidateCalendars() {
  revalidatePath("/calendar/settings");
  revalidatePath("/calendar");
  // The public page renders slots from these rows.
  revalidatePath("/book", "layout");
}

export type NewCalendarInput = {
  name: string;
  description: string;
  members: string[];
  /** Empty means "derive it from the name". */
  slug: string;
  durationMinutes: number;
};

export async function createCalendar(
  input: NewCalendarInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const context = await requireOrgContext();

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the calendar a name." };

  // Re-derived here rather than trusted: the field is editable, and a slug
  // with a slash in it would build a booking URL that resolves to something
  // else entirely.
  const slug = slugify(input.slug.trim() || name);

  const duration = Math.round(input.durationMinutes);
  if (!Number.isFinite(duration) || duration < 5 || duration > 1440) {
    // Mirrors calendars_duration_check.
    return { ok: false, error: "A meeting has to be between 5 minutes and a day." };
  }

  const { data, error } = await supabase
    .from("calendars")
    .insert({
      org_id: context.orgId,
      name,
      slug,
      description: input.description.trim() || null,
      members: input.members.map((member) => member.trim()).filter(Boolean),
      duration_minutes: duration,
      type: "Event",
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: `The handle "${slug}" is already taken by another calendar.`,
      };
    }
    return { ok: false, error: `Could not create the calendar: ${error?.message}` };
  }

  // A calendar with no hours offers nothing and reads as broken, so it starts
  // on the working week — the same default the old single calendar was seeded
  // with. Editable straight away on the Availability tab.
  const { error: rulesError } = await supabase
    .from("calendar_availability_rules")
    .insert(
      [1, 2, 3, 4, 5].map((day) => ({
        org_id: context.orgId,
        calendar_id: data.id,
        day_of_week: day,
        start_time: "09:00",
        end_time: "17:00",
      })),
    );

  if (rulesError) {
    // The calendar exists and is usable; it simply has no hours yet. Worth
    // saying rather than swallowing, because the symptom is an empty week.
    return {
      ok: false,
      error:
        `${name} was created but its opening hours were not: ${rulesError.message}. ` +
        "Set them on the Availability tab.",
    };
  }

  revalidateCalendars();
  return { ok: true, value: { id: data.id } };
}

/**
 * Copies a calendar, including its hours and days off.
 *
 * Bookings are not copied, which is the whole point of the distinction: a
 * duplicate is a new calendar configured like an old one, not a second copy of
 * meetings that only happen once.
 */
export async function duplicateCalendar(id: string): Promise<ActionResult> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const context = await requireOrgContext();

  const { data: source, error: readError } = await supabase
    .from("calendars")
    .select("*")
    .eq("id", id)
    .eq("org_id", context.orgId)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!source) return { ok: false, error: "That calendar no longer exists." };

  const name = `${source.name} (copy)`;
  // Suffixed with a short random tail rather than counting existing copies:
  // the count would race, and the handle is not something anyone reads aloud.
  const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 4)}`;

  const { data: copy, error } = await supabase
    .from("calendars")
    .insert({
      org_id: context.orgId,
      group_id: source.group_id,
      name,
      slug,
      description: source.description,
      members: source.members,
      type: source.type,
      // Off to start with. A duplicate usually exists to be edited before it
      // takes anything, and a second live booking link appearing without being
      // asked for is the wrong default.
      active: false,
      duration_minutes: source.duration_minutes,
      buffer_minutes: source.buffer_minutes,
      min_notice_minutes: source.min_notice_minutes,
      meeting_link: source.meeting_link,
      host_name: source.host_name,
      notify_number: source.notify_number,
    })
    .select("id")
    .single();

  if (error || !copy) {
    return { ok: false, error: `Could not duplicate: ${error?.message}` };
  }

  const [{ data: rules }, { data: blocked }] = await Promise.all([
    supabase.from("calendar_availability_rules").select("*").eq("calendar_id", id),
    supabase.from("calendar_blocked_dates").select("*").eq("calendar_id", id),
  ]);

  if (rules?.length) {
    await supabase.from("calendar_availability_rules").insert(
      rules.map((rule) => ({
        org_id: context.orgId,
        calendar_id: copy.id,
        day_of_week: rule.day_of_week,
        start_time: rule.start_time,
        end_time: rule.end_time,
        active: rule.active,
      })),
    );
  }

  if (blocked?.length) {
    await supabase.from("calendar_blocked_dates").insert(
      blocked.map((row) => ({
        org_id: context.orgId,
        calendar_id: copy.id,
        date: row.date,
        reason: row.reason,
      })),
    );
  }

  revalidateCalendars();
  return { ok: true, value: null };
}

export async function setCalendarActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("calendars")
    .update({ active })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateCalendars();
  return { ok: true, value: null };
}

/** Files a calendar under a group, or takes it out of one with null. */
export async function moveCalendarToGroup(
  id: string,
  groupId: string | null,
): Promise<ActionResult> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("calendars")
    .update({ group_id: groupId })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateCalendars();
  return { ok: true, value: null };
}

/**
 * Deletes a calendar, unless meetings were taken on it.
 *
 * `bookings.calendar_id` is ON DELETE RESTRICT, so the database refuses this
 * anyway — the count is what turns a constraint code into a sentence, and it
 * runs first so the common case reads as a rule rather than as an error.
 */
export async function deleteCalendar(id: string): Promise<ActionResult> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const taken = await countBookings(supabase, id);
  if (taken > 0) {
    return {
      ok: false,
      error:
        `${taken} ${taken === 1 ? "meeting has" : "meetings have"} been booked on this calendar, ` +
        "so it cannot be deleted. Deactivate it instead — the link stops working and the history stays.",
    };
  }

  const { error } = await supabase.from("calendars").delete().eq("id", id);

  if (error) {
    // A booking landed between the count and the delete.
    if (error.code === FK_VIOLATION) {
      return {
        ok: false,
        error: "A meeting was just booked on this calendar. Deactivate it instead.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidateCalendars();
  return { ok: true, value: null };
}

export async function createCalendarGroup(
  name: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const context = await requireOrgContext();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give the group a name." };

  const { data, error } = await supabase
    .from("calendar_groups")
    .insert({ org_id: context.orgId, name: trimmed })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === UNIQUE_VIOLATION) {
      return { ok: false, error: `There is already a group called ${trimmed}.` };
    }
    return { ok: false, error: `Could not create the group: ${error?.message}` };
  }

  revalidateCalendars();
  return { ok: true, value: { id: data.id } };
}

// ---------------------------------------------------------------------------
// Availability, per calendar
// ---------------------------------------------------------------------------

export type AvailabilityRuleInput = {
  day_of_week: number;
  /** `HH:MM`, as an `<input type="time">` produces. */
  start_time: string;
  end_time: string;
  active: boolean;
};

/**
 * Replaces one calendar's entire weekly pattern.
 *
 * Delete-then-insert rather than a per-row diff, as before: the editor hands
 * over the whole week as one object, nothing holds a rule's id — a booking
 * records its own start and end, not the rule that offered it — so a fresh set
 * of ids breaks nothing.
 *
 * Not a transaction, which is the honest tradeoff: PostgREST has no way to send
 * one. A failure between the delete and the insert leaves that calendar with no
 * availability, so the insert goes first in the error message.
 *
 * The delete is scoped to `calendar_id`, which is the fix for what this action
 * used to be: unscoped, it cleared every calendar's hours to save one.
 */
export async function saveAvailability(
  calendarId: string,
  rules: AvailabilityRuleInput[],
): Promise<ActionResult> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const context = await requireOrgContext();

  for (const rule of rules) {
    if (rule.day_of_week < 0 || rule.day_of_week > 6) {
      return { ok: false, error: `${rule.day_of_week} is not a day of the week` };
    }
    if (parseTimeOfDay(rule.end_time) <= parseTimeOfDay(rule.start_time)) {
      return {
        ok: false,
        error: `${rule.start_time}–${rule.end_time} ends before it starts.`,
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("calendar_availability_rules")
    .delete()
    .eq("calendar_id", calendarId);

  if (deleteError) {
    return { ok: false, error: `Could not clear availability: ${deleteError.message}` };
  }

  if (rules.length > 0) {
    const { error: insertError } = await supabase
      .from("calendar_availability_rules")
      .insert(
        rules.map((rule) => ({
          ...rule,
          org_id: context.orgId,
          calendar_id: calendarId,
        })),
      );

    if (insertError) {
      return {
        ok: false,
        error:
          `Availability was cleared but not saved: ${insertError.message}. ` +
          "Nothing is bookable on this calendar until you save again.",
      };
    }
  }

  revalidateCalendars();
  return { ok: true, value: null };
}

/** Blocks one whole day on one calendar. `date` is `YYYY-MM-DD`. */
export async function addBlockedDate(
  calendarId: string,
  date: string,
  reason: string,
): Promise<ActionResult> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const context = await requireOrgContext();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Pick a date first." };
  }

  const { error } = await supabase.from("calendar_blocked_dates").insert({
    org_id: context.orgId,
    calendar_id: calendarId,
    date,
    reason: reason.trim() || null,
  });

  if (error) {
    return {
      ok: false,
      error:
        error.code === UNIQUE_VIOLATION
          ? "That date is already blocked on this calendar."
          : `Could not block that date: ${error.message}`,
    };
  }

  revalidateCalendars();
  return { ok: true, value: null };
}

/**
 * Unblocks a day.
 *
 * Note this does not resurrect anything: blocking a day never cancelled the
 * meetings already on it, it only stopped new ones being booked. Any bookings
 * that survived the block are still there and still occupy their slots.
 */
export async function removeBlockedDate(id: string): Promise<ActionResult> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("calendar_blocked_dates")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateCalendars();
  return { ok: true, value: null };
}

// ---------------------------------------------------------------------------
// The calendar's own booking settings
// ---------------------------------------------------------------------------

export type CalendarSettingsInput = {
  minNoticeMinutes: number;
  bufferMinutes: number;
  meetingLink: string;
  hostName: string;
  notifyNumber: string;
};

/**
 * The numbers and strings that shape how this calendar takes bookings.
 *
 * These four used to be columns on `settings`, which meant one meeting link and
 * one sign-off for every calendar an account had.
 */
export async function saveCalendarSettings(
  calendarId: string,
  input: CalendarSettingsInput,
): Promise<ActionResult> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  // Mirrors calendars_min_notice_check and calendars_buffer_check.
  const notice = Math.round(input.minNoticeMinutes);
  if (!Number.isFinite(notice) || notice < 0) {
    return { ok: false, error: "Minimum notice cannot be negative." };
  }

  const buffer = Math.round(input.bufferMinutes);
  if (!Number.isFinite(buffer) || buffer < 0 || buffer > 1440) {
    return { ok: false, error: "The buffer has to be between 0 minutes and a day." };
  }

  const rawLink = input.meetingLink.trim();
  let meetingLink: string | null = null;
  if (rawLink) {
    // Checked rather than trusted: this string is sent to clients, and a
    // mistyped link in a confirmation is worse than no link at all.
    try {
      const url = new URL(rawLink);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("not a web link");
      }
      meetingLink = url.toString();
    } catch {
      return {
        ok: false,
        error: "The meeting link needs to be a full URL, starting with https://.",
      };
    }
  }

  const rawNotify = input.notifyNumber.trim();
  let notifyNumber: string | null = null;
  if (rawNotify) {
    notifyNumber = normalizePhone(rawNotify);
    if (!notifyNumber) {
      return {
        ok: false,
        error:
          "The alert number needs 10 digits, or an international number with its + country code.",
      };
    }
  }

  const { error } = await supabase
    .from("calendars")
    .update({
      min_notice_minutes: notice,
      buffer_minutes: buffer,
      meeting_link: meetingLink,
      host_name: input.hostName.trim() || null,
      notify_number: notifyNumber,
    })
    .eq("id", calendarId);

  if (error) return { ok: false, error: error.message };

  revalidateCalendars();
  return { ok: true, value: null };
}

// ---------------------------------------------------------------------------
// Troubleshooting
// ---------------------------------------------------------------------------

export type TroubleshootSlot = {
  /** Absolute instant, ISO. */
  start: string;
  /** Minutes from midnight in the app zone, for a stable label. */
  minutes: number;
  status: "available" | "booked" | "past" | "outside_notice";
};

export type TroubleshootDay = {
  dayKey: string;
  /** Set when the whole day is off — a blocked date, or no hours at all. */
  closedReason: string | null;
  slots: TroubleshootSlot[];
  /** What the generator was working from, so the view can explain itself. */
  hours: { start: string; end: string }[];
  minNoticeMinutes: number;
  durationMinutes: number;
  bufferMinutes: number;
};

/**
 * One day of a calendar, with the reason each slot is missing.
 *
 * The booking widget only ever shows what is bookable, so "why can nobody book
 * Tuesday?" has no answer on screen. This walks the same weekly hours the
 * generator walks and labels every candidate — taken, too soon, already gone —
 * rather than filtering them out.
 *
 * It deliberately does not call `generateDay`: that function's whole job is to
 * return only the slots that survive, and re-deriving the rejects from its
 * output would be guessing at its reasons. The rules it reads are the same
 * rows, so the two agree on what is *available*, which is the part that has to
 * match.
 */
export async function troubleshootDay(
  calendarId: string,
  dayKey: string,
): Promise<ActionResult<TroubleshootDay>> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return { ok: false, error: "That is not a date." };
  }

  const context = await requireOrgContext();
  const calendar = await getCalendarById(supabase, calendarId, context.orgId);
  if (!calendar) return { ok: false, error: "That calendar no longer exists." };

  const [rules, blocked, busy] = await Promise.all([
    listAvailabilityRules(supabase, calendar),
    listBlockedDates(supabase, calendar.id, dayKey),
    listBusyBookings(supabase, calendar.id, dayKey, dayKey),
  ]);

  const now = new Date();
  const closed = blocked.find((row) => row.date === dayKey);
  const dayOfWeek = dayOfWeekOf(dayKey);
  const applicable = rules
    .filter((rule) => rule.active && rule.day_of_week === dayOfWeek)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const base = {
    dayKey,
    hours: applicable.map((rule) => ({
      start: rule.start_time.slice(0, 5),
      end: rule.end_time.slice(0, 5),
    })),
    minNoticeMinutes: calendar.min_notice_minutes,
    durationMinutes: calendar.duration_minutes,
    bufferMinutes: calendar.buffer_minutes,
  };

  if (closed) {
    return {
      ok: true,
      value: {
        ...base,
        closedReason: closed.reason?.trim() || "Blocked",
        slots: [],
      },
    };
  }

  if (applicable.length === 0) {
    return {
      ok: true,
      value: { ...base, closedReason: "No working hours on this day", slots: [] },
    };
  }

  const cadence = calendar.duration_minutes + calendar.buffer_minutes;
  const durationMs = calendar.duration_minutes * 60_000;
  const earliest = now.getTime() + calendar.min_notice_minutes * 60_000;

  const slots = new Map<string, TroubleshootSlot>();

  for (const rule of applicable) {
    const opens = parseTimeOfDay(rule.start_time);
    const closes = parseTimeOfDay(rule.end_time);

    for (
      let minute = opens;
      minute + calendar.duration_minutes <= closes;
      minute += cadence
    ) {
      const start = zonedTimeToUtc(dayKey, minute);
      const startMs = start.getTime();
      const endMs = startMs + durationMs;
      const iso = start.toISOString();

      // Checked in the order a person asks the questions: has it happened,
      // is it too soon, is it taken.
      const taken = busy.some((interval) => {
        const busyStart = Date.parse(interval.start_time);
        const busyEnd = Date.parse(interval.end_time);
        const busyBuffer =
          (interval.buffer_minutes ?? calendar.buffer_minutes) * 60_000;
        return (
          startMs < busyEnd + busyBuffer &&
          busyStart < endMs + calendar.buffer_minutes * 60_000
        );
      });

      const status: TroubleshootSlot["status"] =
        startMs < now.getTime()
          ? "past"
          : taken
            ? "booked"
            : startMs < earliest
              ? "outside_notice"
              : "available";

      slots.set(iso, { start: iso, minutes: minute, status });
    }
  }

  return {
    ok: true,
    value: {
      ...base,
      closedReason: null,
      slots: [...slots.values()].sort((a, b) => a.minutes - b.minutes),
    },
  };
}

// ---------------------------------------------------------------------------
// One time booking links
// ---------------------------------------------------------------------------

/**
 * Mints a link that expires after one booking.
 *
 * Generated here rather than in the browser because the token has to be
 * recorded — "used once" is state, and a token nobody wrote down cannot be
 * spent. The Share dialog used to build a plausible URL client-side that
 * resolved to nothing.
 *
 * Returns the whole URL rather than the token, so the origin is resolved once,
 * on the server, from APP_BASE_URL. A link built from `window.location.origin`
 * on a preview deployment would be pasted into an email and die with that host.
 */
export async function createOneTimeBookingLink(
  calendarId: string,
): Promise<ActionResult<{ url: string }>> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const context = await requireOrgContext();
  const calendar = await getCalendarById(supabase, calendarId, context.orgId);
  if (!calendar) return { ok: false, error: "That calendar no longer exists." };

  const origin = appBaseUrl();
  if (!origin) {
    // A token with nowhere to point is worse than no token: it would sit in
    // the table forever, unused and unusable.
    return {
      ok: false,
      error:
        "The app does not know its own address, so it cannot build a link. Set APP_BASE_URL.",
    };
  }

  try {
    const link = await createOneTimeLink(supabase, calendar);
    return { ok: true, value: { url: `${origin}/book/otl/${link.token}` } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create the link.",
    };
  }
}

/**
 * The Basic details section of the calendar editor.
 *
 * Until now that whole screen was a draft in React that a reload threw away —
 * it said so, in a notice at the top. This is the half of it that has columns
 * to land in: the name, the description, the handle the public link hangs off,
 * and which group it belongs to.
 *
 * The logo is separate (`saveCalendarLogo`) because it is a file upload and
 * cannot travel in the same JSON payload. Meeting invite title and meeting
 * colour are deliberately not here: nothing stores them, and the editor marks
 * them as not built rather than accepting text that would vanish.
 */
export async function saveCalendarBasics(
  calendarId: string,
  input: {
    name: string;
    description: string;
    slug: string;
    groupId: string | null;
  },
): Promise<ActionResult> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "A calendar needs a name." };

  // Run through the same slugifier `createCalendar` uses rather than trusting
  // what was typed: this ends up in a public URL, and a handle with a space or
  // a slash in it produces a link that 404s.
  const slug = slugify(input.slug.trim() || name);
  if (!slug) {
    return {
      ok: false,
      error: "That custom URL has no usable characters. Try letters and numbers.",
    };
  }

  const { error } = await supabase
    .from("calendars")
    .update({
      name,
      description: input.description.trim() || null,
      slug,
      group_id: input.groupId,
    })
    .eq("id", calendarId);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: `Another calendar already uses "${slug}". Pick a different custom URL.`,
      };
    }
    return { ok: false, error: `Could not save: ${error.message}` };
  }

  revalidateCalendars();
  return { ok: true, value: null };
}

/** What the logo may be. Mirrors the hint under the drop zone. */
const LOGO_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif"];

/** 2MB. A logo is a small square; anything larger is a photo by mistake. */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Uploads a calendar's logo and records where it went.
 *
 * Stored at `<org_id>/<calendar_id>.<ext>` in the public `calendar-logos`
 * bucket. The path is derived rather than taken from the caller for two
 * reasons: the storage policies key off that first segment being an org you
 * belong to, and a caller-supplied name is how one account overwrites
 * another's file.
 *
 * `upsert`, because replacing a logo is the ordinary case and a second upload
 * should not fail on the object already being there.
 *
 * Public URL rather than a signed one: the booking page is public, and a signed
 * URL that expires would break the page for whoever opened it an hour ago.
 */
export async function saveCalendarLogo(
  calendarId: string,
  formData: FormData,
): Promise<ActionResult<string | null>> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const context = await requireOrgContext();
  const file = formData.get("logo");

  // No file means "remove it" — the drop zone's clear button posts an empty
  // form rather than needing an action of its own.
  if (!(file instanceof File) || file.size === 0) {
    const { error } = await supabase
      .from("calendars")
      .update({ logo_url: null })
      .eq("id", calendarId);

    if (error) {
      return { ok: false, error: `Could not remove the logo: ${error.message}` };
    }

    revalidateCalendars();
    return { ok: true, value: null };
  }

  if (!LOGO_TYPES.includes(file.type)) {
    return { ok: false, error: "The logo has to be a PNG, JPEG, JPG or GIF." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "That image is over 2MB. Try a smaller one." };
  }

  const extension =
    file.type === "image/png" ? "png" : file.type === "image/gif" ? "gif" : "jpg";
  const path = `${context.orgId}/${calendarId}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("calendar-logos")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return { ok: false, error: `Could not upload the logo: ${uploadError.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("calendar-logos").getPublicUrl(path);

  // Cache-busted, because the path is stable across replacements — without
  // this, uploading a new logo leaves every browser showing the old one.
  const url = `${publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from("calendars")
    .update({ logo_url: url })
    .eq("id", calendarId);

  if (error) {
    return { ok: false, error: `Uploaded, but could not save: ${error.message}` };
  }

  revalidateCalendars();
  return { ok: true, value: url };
}

/**
 * Points a calendar at the operator's own hours, or back at its own.
 *
 * Separate from `saveAvailability` because it changes *which* set of rules the
 * calendar reads rather than editing a set — and because turning it on must not
 * destroy the calendar's own hours. They stay in
 * `calendar_availability_rules`, ignored, and come back when it is turned off.
 */
export async function setSyncAvailabilityFromUser(
  calendarId: string,
  sync: boolean,
): Promise<ActionResult> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("calendars")
    .update({ sync_availability_from_user: sync })
    .eq("id", calendarId);

  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  revalidateCalendars();
  return { ok: true, value: null };
}

/**
 * Replaces the operator's own weekly hours.
 *
 * Same delete-then-insert as `saveAvailability`, for the same reasons, and the
 * same honest caveat: PostgREST cannot send a transaction, so a failure between
 * the two leaves the hours empty and the error message says so.
 *
 * Scoped by organization rather than by user — see the table's comment for why
 * "the user" is the account here.
 */
export async function saveUserAvailability(
  rules: AvailabilityRuleInput[],
): Promise<ActionResult> {
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const context = await requireOrgContext();

  for (const rule of rules) {
    if (rule.day_of_week < 0 || rule.day_of_week > 6) {
      return { ok: false, error: `${rule.day_of_week} is not a day of the week` };
    }
    if (parseTimeOfDay(rule.end_time) <= parseTimeOfDay(rule.start_time)) {
      return {
        ok: false,
        error: `${rule.start_time}-${rule.end_time} ends before it starts.`,
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("user_availability_rules")
    .delete()
    .eq("org_id", context.orgId);

  if (deleteError) {
    return { ok: false, error: `Could not clear your hours: ${deleteError.message}` };
  }

  if (rules.length > 0) {
    const { error: insertError } = await supabase
      .from("user_availability_rules")
      .insert(rules.map((rule) => ({ ...rule, org_id: context.orgId })));

    if (insertError) {
      return {
        ok: false,
        error:
          `Your hours were cleared but not saved: ${insertError.message}. ` +
          "Calendars following them have no availability until you save again.",
      };
    }
  }

  revalidateCalendars();
  return { ok: true, value: null };
}
