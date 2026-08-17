import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSettings } from "@/lib/settings";
import type {
  AvailabilityRule,
  BlockedDate,
  Booking,
  Contact,
  Database,
} from "@/types/database";

import {
  BOOKING_HORIZON_DAYS,
  generateDays,
  type BusyInterval,
  type DaySlots,
} from "./slots";
import { addDays, todayDayKey, weekOf, zonedTimeToUtc } from "./time";

/**
 * Reads for the calendar.
 *
 * Split from `slots.ts` on purpose: that file is pure and runs in the browser
 * too, this one talks to the database. The generator never fetches anything, so
 * there is exactly one place that decides what a slot is.
 */

export async function listAvailabilityRules(
  supabase: SupabaseClient<Database>,
  orgId?: string,
): Promise<AvailabilityRule[]> {
  const base = supabase.from("availability_rules").select("*");
  const { data, error } = await (orgId ? base.eq("org_id", orgId) : base)
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
  fromDayKey: string = todayDayKey(),
  orgId?: string,
): Promise<BlockedDate[]> {
  const base = supabase.from("blocked_dates").select("*");
  const { data, error } = await (orgId ? base.eq("org_id", orgId) : base)
    .gte("date", fromDayKey)
    .order("date");

  if (error) {
    throw new Error(`Failed to load blocked dates: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Confirmed bookings overlapping a window of days.
 *
 * Widened by a day at each end before hitting the database: a meeting starting
 * at 4pm on the day before the window can still consume the window's first
 * slot through its buffer, and a query bounded exactly at midnight would miss
 * it and offer a time that the exclusion constraint then refuses.
 */
export async function listBusyBookings(
  supabase: SupabaseClient<Database>,
  fromDayKey: string,
  toDayKey: string,
  orgId?: string,
): Promise<BusyInterval[]> {
  const base = supabase.from("bookings").select("start_time, end_time");
  const { data, error } = await (orgId ? base.eq("org_id", orgId) : base)
    .eq("status", "confirmed")
    .gte("start_time", zonedTimeToUtc(addDays(fromDayKey, -1), 0).toISOString())
    .lt("start_time", zonedTimeToUtc(addDays(toDayKey, 2), 0).toISOString())
    .order("start_time");

  if (error) {
    throw new Error(`Failed to load bookings: ${error.message}`);
  }

  return data ?? [];
}

export type CalendarWeek = {
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
  anchorDayKey: string,
  now: Date = new Date(),
  orgId?: string,
): Promise<CalendarWeek> {
  const today = todayDayKey(now);
  const horizonEnd = addDays(today, BOOKING_HORIZON_DAYS);

  const clamped =
    anchorDayKey < today ? today : anchorDayKey > horizonEnd ? horizonEnd : anchorDayKey;

  const days = weekOf(clamped);
  const [first, last] = [days[0], days[6]];

  // `orgId` is passed through to every read rather than relied on from RLS,
  // because the public booking page runs on the service role with no session —
  // unscoped, it would generate a calendar from every client's availability at
  // once, showing one business's free slots as another's and treating a third's
  // meetings as busy time.
  const [rules, blockedRows, busy, settings] = await Promise.all([
    listAvailabilityRules(supabase, orgId),
    listBlockedDates(supabase, first, orgId),
    listBusyBookings(supabase, first, last, orgId),
    getSettings(supabase, orgId),
  ]);

  const blocked = new Map(blockedRows.map((row) => [row.date, row.reason]));

  return {
    weekStart: first,
    days: generateDays(days, {
      rules,
      blocked,
      busy,
      now,
      // Falls back to the column default rather than to zero. A missing
      // settings row means the migration hasn't run, and "no minimum notice"
      // is the wrong way to fail — it would let someone book the slot that
      // starts in four minutes.
      minNoticeMinutes: settings?.booking_min_notice_minutes ?? 120,
    }),
    earliestWeek: weekOf(today)[0],
    latestWeek: weekOf(horizonEnd)[0],
  };
}

/**
 * The slots for a single day, regenerated at submit time.
 *
 * This is the gate on `/book`: the action takes the instant the form sent, asks
 * this what is actually open, and refuses anything that isn't in the list. It
 * deliberately re-reads instead of trusting the page the client rendered, which
 * may be minutes old and was in any case served to an untrusted browser.
 */
export async function getDaySlots(
  supabase: SupabaseClient<Database>,
  dayKey: string,
  now: Date = new Date(),
): Promise<DaySlots> {
  const [rules, blockedRows, busy, settings] = await Promise.all([
    listAvailabilityRules(supabase),
    listBlockedDates(supabase, dayKey),
    listBusyBookings(supabase, dayKey, dayKey),
    getSettings(supabase),
  ]);

  return generateDays([dayKey], {
    rules,
    blocked: new Map(blockedRows.map((row) => [row.date, row.reason])),
    busy,
    now,
    minNoticeMinutes: settings?.booking_min_notice_minutes ?? 120,
  })[0];
}

/** A booking with whatever contact it was linked to, for the dashboard. */
export type BookingWithContact = Booking & {
  contact: Pick<Contact, "id" | "name" | "business_name"> | null;
};

export type BookingsView = {
  upcoming: BookingWithContact[];
  /** Most recent first — the opposite of `upcoming`, because recency is what matters. */
  past: BookingWithContact[];
  /** Cancelled meetings still ahead of us, kept separate rather than dropped. */
  cancelled: BookingWithContact[];
};

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
 */
export async function listBookingsBetween(
  supabase: SupabaseClient<Database>,
  fromDayKey: string,
  toDayKey: string,
): Promise<BookingWithContact[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, contacts (id, name, business_name)")
    .gte("start_time", zonedTimeToUtc(addDays(fromDayKey, -1), 0).toISOString())
    .lt("start_time", zonedTimeToUtc(addDays(toDayKey, 2), 0).toISOString())
    .order("start_time");

  if (error) {
    throw new Error(`Failed to load bookings: ${error.message}`);
  }

  return (data ?? []).map(({ contacts, ...booking }) => ({
    ...booking,
    contact: contacts,
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
): Promise<BookingsView> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, contacts (id, name, business_name)")
    .order("start_time", { ascending: false });

  if (error) {
    throw new Error(`Failed to load bookings: ${error.message}`);
  }

  const view: BookingsView = { upcoming: [], past: [], cancelled: [] };
  const nowMs = now.getTime();

  for (const row of data ?? []) {
    const { contacts, ...booking } = row;
    const entry: BookingWithContact = { ...booking, contact: contacts };

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
