import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AvailabilityRule,
  BlockedDate,
  Booking,
  BookingCalendar,
  Contact,
  Database,
} from "@/types/database";

import {
  BOOKING_HORIZON_DAYS,
  generateDays,
  slotRulesOf,
  type BusyInterval,
  type DaySlots,
} from "./slots";
import {
  addDays,
  leadingBlanks,
  monthOf,
  startOfMonth,
  todayDayKey,
  weekOf,
  zonedTimeToUtc,
} from "./time";

/**
 * Reads for the calendar.
 *
 * Split from `slots.ts` on purpose: that file is pure and runs in the browser
 * too, this one talks to the database. The generator never fetches anything, so
 * there is exactly one place that decides what a slot is.
 *
 * Every read here takes a `calendarId`, and it is required rather than
 * optional. These used to be scoped by organization alone, which was the same
 * thing while an organization had one implicit calendar; now it would mean
 * generating a discovery-call calendar out of the site-visit calendar's hours.
 * A missing scope should not compile.
 */

export async function listAvailabilityRules(
  supabase: SupabaseClient<Database>,
  calendarId: string,
): Promise<AvailabilityRule[]> {
  const { data, error } = await supabase
    .from("calendar_availability_rules")
    .select("*")
    .eq("calendar_id", calendarId)
    .order("day_of_week")
    .order("start_time");

  if (error) {
    throw new Error(`Failed to load availability: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Blocked dates from today forward.
 *
 * Past ones are kept in the table — deleting history to tidy a list is how you
 * lose the answer to "why was I closed that week" — but nothing needs them.
 */
export async function listBlockedDates(
  supabase: SupabaseClient<Database>,
  calendarId: string,
  fromDayKey: string = todayDayKey(),
): Promise<BlockedDate[]> {
  const { data, error } = await supabase
    .from("calendar_blocked_dates")
    .select("*")
    .eq("calendar_id", calendarId)
    .gte("date", fromDayKey)
    .order("date");

  if (error) {
    throw new Error(`Failed to load blocked dates: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Confirmed bookings overlapping a window of days, on one calendar.
 *
 * Widened by a day at each end before hitting the database: a meeting starting
 * at 4pm on the day before the window can still consume the window's first
 * slot through its buffer, and a query bounded exactly at midnight would miss
 * it and offer a time that the exclusion constraint then refuses.
 *
 * `buffer_minutes` comes back with each row because the generator compares
 * against the buffer a meeting was *booked* under, not today's setting.
 *
 * `ignoreBookingId` leaves one meeting out of the busy set, and exists for
 * exactly one caller: rescheduling. A booking being moved must not block its
 * own new time — with a buffer, the 2pm meeting makes 2:45 unavailable, so
 * "move it half an hour later" would be refused on the grounds that it is
 * already booked, by itself.
 */
export async function listBusyBookings(
  supabase: SupabaseClient<Database>,
  calendarId: string,
  fromDayKey: string,
  toDayKey: string,
  ignoreBookingId?: string,
): Promise<BusyInterval[]> {
  const base = supabase
    .from("bookings")
    .select("start_time, end_time, buffer_minutes")
    .eq("calendar_id", calendarId)
    .eq("status", "confirmed");

  const { data, error } = await (
    ignoreBookingId ? base.neq("id", ignoreBookingId) : base
  )
    .gte("start_time", zonedTimeToUtc(addDays(fromDayKey, -1), 0).toISOString())
    .lt("start_time", zonedTimeToUtc(addDays(toDayKey, 2), 0).toISOString())
    .order("start_time");

  if (error) {
    throw new Error(`Failed to load bookings: ${error.message}`);
  }

  return data ?? [];
}

export type CalendarWeek = {
  /** Which calendar these slots belong to. */
  calendar: BookingCalendar;
  /** Monday of the week being shown. */
  weekStart: string;
  days: DaySlots[];
  /** Bounds for the back/forward controls, so they can be disabled at the ends. */
  earliestWeek: string;
  latestWeek: string;
};

/**
 * Everything `/book` needs for one week, in three round trips.
 *
 * `anchor` is any day in the wanted week; it is clamped into the bookable
 * horizon first, so a hand-edited `?week=` can't page the calendar into 2043
 * and can't page it into the past.
 */
export async function getCalendarWeek(
  supabase: SupabaseClient<Database>,
  calendar: BookingCalendar,
  anchorDayKey: string,
  now: Date = new Date(),
): Promise<CalendarWeek> {
  const today = todayDayKey(now);
  const horizonEnd = addDays(today, BOOKING_HORIZON_DAYS);

  const clamped =
    anchorDayKey < today ? today : anchorDayKey > horizonEnd ? horizonEnd : anchorDayKey;

  const days = weekOf(clamped);
  const [first, last] = [days[0], days[6]];

  const [rules, blockedRows, busy] = await Promise.all([
    listAvailabilityRules(supabase, calendar.id),
    listBlockedDates(supabase, calendar.id, first),
    listBusyBookings(supabase, calendar.id, first, last),
  ]);

  const blocked = new Map(blockedRows.map((row) => [row.date, row.reason]));

  return {
    calendar,
    weekStart: first,
    days: generateDays(days, {
      rules,
      blocked,
      busy,
      now,
      calendar: slotRulesOf(calendar),
    }),
    earliestWeek: weekOf(today)[0],
    latestWeek: weekOf(horizonEnd)[0],
  };
}

export type CalendarMonth = {
  /** Which calendar these slots belong to. */
  calendar: BookingCalendar;
  /** The 1st of the month being shown. */
  monthStart: string;
  /** Every day of that month, 1st to last. Days outside the bookable horizon
   *  are present but empty, so the grid stays a real calendar. */
  days: DaySlots[];
  /** How many blank cells precede the 1st in a Monday-first grid. */
  leadingBlanks: number;
  /** Bounds for the back/forward controls, so they can be disabled at the ends. */
  earliestMonth: string;
  latestMonth: string;
};

/**
 * Everything `/book` needs for one month, in the same three round trips a week
 * takes.
 *
 * Widening the window costs nothing extra in queries — the blocked dates and
 * the bookings were already range reads, and `generateDays` is pure arithmetic
 * over the rules — so a month is three reads and about thirty days of slot
 * generation rather than seven.
 *
 * `anchor` is any day in the wanted month. Unlike the week version this does
 * *not* clamp the anchor into the horizon, because a month is mostly a drawing:
 * clamping would refuse to render October at all once the horizon ends in
 * mid-October, when the right answer is to draw the month with its later days
 * empty. The bounds below are what stop the arrows paging into 2043.
 */
export async function getCalendarMonth(
  supabase: SupabaseClient<Database>,
  calendar: BookingCalendar,
  anchorDayKey: string,
  now: Date = new Date(),
): Promise<CalendarMonth> {
  const today = todayDayKey(now);
  const horizonEnd = addDays(today, BOOKING_HORIZON_DAYS);

  const clamped =
    anchorDayKey < startOfMonth(today)
      ? today
      : anchorDayKey > horizonEnd
        ? horizonEnd
        : anchorDayKey;

  const days = monthOf(clamped);
  const [first, last] = [days[0], days[days.length - 1]];

  const [rules, blockedRows, busy] = await Promise.all([
    listAvailabilityRules(supabase, calendar.id),
    listBlockedDates(supabase, calendar.id, first),
    listBusyBookings(supabase, calendar.id, first, last),
  ]);

  const blocked = new Map(blockedRows.map((row) => [row.date, row.reason]));

  const generated = generateDays(days, {
    rules,
    blocked,
    busy,
    now,
    calendar: slotRulesOf(calendar),
  });

  return {
    calendar,
    monthStart: first,
    // Past the horizon the generator would happily invent slots nobody may
    // book, so those days are emptied here rather than filtered out — the grid
    // still needs the cell, it just has nothing in it.
    days: generated.map((day) =>
      day.dayKey > horizonEnd ? { ...day, slots: [], closedReason: null } : day,
    ),
    leadingBlanks: leadingBlanks(first),
    earliestMonth: startOfMonth(today),
    latestMonth: startOfMonth(horizonEnd),
  };
}

/**
 * The slots for a single day, regenerated at submit time.
 *
 * This is the gate on `/book`: the action takes the instant the form sent, asks
 * this what is actually open, and refuses anything that isn't in the list. It
 * deliberately re-reads instead of trusting the page the client rendered, which
 * may be minutes old and was in any case served to an untrusted browser.
 *
 * Takes the calendar row rather than an id so it cannot be called without the
 * three numbers the generator needs — reading them here would be a fourth
 * round trip on the hot path of every booking.
 *
 * `ignoreBookingId` is passed straight through to `listBusyBookings`; see the
 * note there for why rescheduling needs it.
 */
export async function getDaySlots(
  supabase: SupabaseClient<Database>,
  calendar: BookingCalendar,
  dayKey: string,
  now: Date = new Date(),
  ignoreBookingId?: string,
): Promise<DaySlots> {
  const [rules, blockedRows, busy] = await Promise.all([
    listAvailabilityRules(supabase, calendar.id),
    listBlockedDates(supabase, calendar.id, dayKey),
    listBusyBookings(supabase, calendar.id, dayKey, dayKey, ignoreBookingId),
  ]);

  return generateDays([dayKey], {
    rules,
    blocked: new Map(blockedRows.map((row) => [row.date, row.reason])),
    busy,
    now,
    calendar: slotRulesOf(calendar),
  })[0];
}

/** A booking with whatever contact it was linked to, and which calendar it is on. */
export type BookingWithContact = Booking & {
  contact: Pick<Contact, "id" | "name" | "business_name"> | null;
  /** Null only if the calendar row went missing, which the schema forbids. */
  calendar: Pick<BookingCalendar, "id" | "name" | "slug"> | null;
};

export type BookingsView = {
  upcoming: BookingWithContact[];
  /** Most recent first — the opposite of `upcoming`, because recency is what matters. */
  past: BookingWithContact[];
  /** Cancelled meetings still ahead of us, kept separate rather than dropped. */
  cancelled: BookingWithContact[];
};

/** The columns every dashboard read of a booking pulls in alongside the row. */
const BOOKING_WITH_RELATIONS =
  "*, contacts (id, name, business_name), calendars (id, name, slug)";

/**
 * Every booking overlapping a window of calendar days, for the grid.
 *
 * Cancelled ones are included rather than filtered: the grid draws them struck
 * through, because "that slot is free again" is information the operator wants
 * on the day it was going to happen, not a row silently missing.
 *
 * The window is widened by a day at each end and then filtered by start day in
 * the caller — the same reason `listBusyBookings` does it. A booking starting
 * at 11pm on the day before the window is a different question from one whose
 * *start day* is in it, and the zone offset means an exact midnight bound in
 * UTC cuts the wrong instant.
 *
 * `calendarId` is optional here, unlike in the slot reads: the operator's
 * calendar shows every meeting by default, and narrowing to one is a filter on
 * screen rather than a correctness requirement.
 */
export async function listBookingsBetween(
  supabase: SupabaseClient<Database>,
  fromDayKey: string,
  toDayKey: string,
  calendarId?: string,
): Promise<BookingWithContact[]> {
  const base = supabase.from("bookings").select(BOOKING_WITH_RELATIONS);
  const { data, error } = await (calendarId
    ? base.eq("calendar_id", calendarId)
    : base)
    .gte("start_time", zonedTimeToUtc(addDays(fromDayKey, -1), 0).toISOString())
    .lt("start_time", zonedTimeToUtc(addDays(toDayKey, 2), 0).toISOString())
    .order("start_time");

  if (error) {
    throw new Error(`Failed to load bookings: ${error.message}`);
  }

  return (data ?? []).map(({ contacts, calendars, ...booking }) => ({
    ...booking,
    contact: contacts,
    calendar: calendars,
  }));
}

/**
 * Everything the Calendar page shows, in one round trip.
 *
 * Split in memory rather than by three queries: the whole set is small — this
 * is one person's meetings — and one ordered read is cheaper than three
 * round trips plus the risk of them disagreeing about where "now" is.
 *
 * Past bookings are capped rather than unbounded. The page is for what's
 * coming; history is context, and an unbounded list would grow forever behind
 * a scrollbar nobody reaches.
 */
export async function getBookingsView(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
  pastLimit = 25,
  calendarId?: string,
): Promise<BookingsView> {
  const base = supabase.from("bookings").select(BOOKING_WITH_RELATIONS);
  const { data, error } = await (calendarId
    ? base.eq("calendar_id", calendarId)
    : base
  ).order("start_time", { ascending: false });

  if (error) {
    throw new Error(`Failed to load bookings: ${error.message}`);
  }

  const view: BookingsView = { upcoming: [], past: [], cancelled: [] };
  const nowMs = now.getTime();

  for (const row of data ?? []) {
    const { contacts, calendars, ...booking } = row;
    const entry: BookingWithContact = {
      ...booking,
      contact: contacts,
      calendar: calendars,
    };

    // A meeting counts as upcoming until it has finished, not until it has
    // started — one that is happening right now belongs at the top of the
    // page, not in the history.
    const ahead = Date.parse(booking.end_time) >= nowMs;

    if (booking.status === "cancelled") {
      if (ahead) view.cancelled.push(entry);
    } else if (ahead) {
      view.upcoming.push(entry);
    } else if (view.past.length < pastLimit) {
      view.past.push(entry);
    }
  }

  // The query sorts newest-first, which is right for past and cancelled and
  // backwards for upcoming: the next meeting belongs at the top.
  view.upcoming.reverse();
  view.cancelled.reverse();

  return view;
}

/**
 * One contact's meetings that have not happened yet, soonest first.
 *
 * What the agent's cancel and reschedule tools work from: the model is never
 * handed a booking id it could not have learned about here, so "cancel my
 * appointment" can only ever reach a meeting belonging to the person it is
 * texting with.
 *
 * Scoped by contact *and* organization. The contact id alone would be enough
 * under RLS and is not enough on the Twilio path, which runs service-role with
 * RLS bypassed — the same reasoning as every other read in this file.
 *
 * Cancelled rows are left out, unlike `getBookingsView`: this list exists to be
 * acted on, and there is nothing to do to a meeting that is already cancelled.
 */
export async function listUpcomingBookingsForContact(
  supabase: SupabaseClient<Database>,
  { contactId, orgId }: { contactId: string; orgId: string },
  now: Date = new Date(),
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .eq("status", "confirmed")
    // On `end_time`, not `start_time`: a meeting happening right now is still
    // one somebody might be texting to say they cannot make.
    .gte("end_time", now.toISOString())
    .order("start_time");

  if (error) {
    throw new Error(`Failed to load this contact's bookings: ${error.message}`);
  }

  return data ?? [];
}
