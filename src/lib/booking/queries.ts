import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSettings } from "@/lib/settings";
import type {
  AvailabilityRule,
  BlockedDate,
  Booking,
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
): Promise<AvailabilityRule[]> {
  const { data, error } = await supabase
    .from("availability_rules")
    .select("*")
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
): Promise<BlockedDate[]> {
  const { data, error } = await supabase
    .from("blocked_dates")
    .select("*")
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
): Promise<BusyInterval[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("start_time, end_time")
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
): Promise<CalendarWeek> {
  const today = todayDayKey(now);
  const horizonEnd = addDays(today, BOOKING_HORIZON_DAYS);

  const clamped =
    anchorDayKey < today ? today : anchorDayKey > horizonEnd ? horizonEnd : anchorDayKey;

  const days = weekOf(clamped);
  const [first, last] = [days[0], days[6]];

  const [rules, blockedRows, busy, settings] = await Promise.all([
    listAvailabilityRules(supabase),
    listBlockedDates(supabase, first),
    listBusyBookings(supabase, first, last),
    getSettings(supabase),
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

/** Confirmed bookings from now forward, soonest first. */
export async function listUpcomingBookings(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("status", "confirmed")
    .gte("start_time", now.toISOString())
    .order("start_time");

  if (error) {
    throw new Error(`Failed to load bookings: ${error.message}`);
  }

  return data ?? [];
}
