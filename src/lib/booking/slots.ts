/**
 * Open slot generation.
 *
 * Pure functions over rows that someone else fetched: no Supabase client, no
 * `server-only`. That is deliberate on both counts — the booking widget renders
 * the same slots in the browser that the action validates on the server, and
 * the only way to be sure those two agree is for them to run the same code.
 *
 * The rule that matters: **a slot the generator did not produce cannot be
 * booked**. `/book` is a public endpoint that sends SMS on your Twilio account,
 * so the action re-generates the day and checks the submitted instant is in the
 * list, rather than trusting the timestamp that arrived in the request.
 *
 * The meeting length, the buffer and the minimum notice used to be constants
 * here and a column on `settings`. They are columns on `calendars` now, passed
 * in per call, because "how long is a meeting" has a different answer on a
 * discovery call and a site visit. Nothing in this file knows what a calendar
 * is beyond those three numbers.
 */

import type { AvailabilityRule } from "@/types/database";

import { dayOfWeekOf, parseTimeOfDay, zonedTimeToUtc } from "./time";

/**
 * How far ahead the calendar goes.
 *
 * Still global: an unbounded booking page will eventually take a meeting
 * eighteen months out from someone who will not be thinking about it by then,
 * and that is true of every calendar rather than a property of any one.
 */
export const BOOKING_HORIZON_DAYS = 56;

/**
 * What the generator needs to know about the calendar it is generating.
 *
 * A structural type rather than the `BookingCalendar` row, so this file stays
 * pure and the browser bundle does not pull in the database types to render a
 * week of slots.
 */
export type SlotRules = {
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
};

/**
 * The fallbacks, used only when a calendar cannot be read.
 *
 * They match the column defaults in `20260831000000_calendars.sql`. Notice
 * falls back to two hours rather than to zero on purpose: "no minimum notice"
 * is the wrong way to fail, because it hands out the slot that starts in four
 * minutes.
 */
export const DEFAULT_SLOT_RULES: SlotRules = {
  durationMinutes: 30,
  bufferMinutes: 15,
  minNoticeMinutes: 120,
};

const MS_PER_MINUTE = 60_000;

/** Just enough of a booking row to know what it occupies. */
export type BusyInterval = {
  start_time: string;
  end_time: string;
  /**
   * The buffer that booking was taken under, which may not be the calendar's
   * current one. Snapshotted on the row for exactly this reason — see
   * `bookings.buffer_minutes`. Optional so a caller with only a time range
   * still works; it falls back to the calendar's buffer.
   */
  buffer_minutes?: number | null;
};

export type Slot = {
  /** Absolute instant, ISO. This is the value the booking form submits back. */
  start: string;
  end: string;
};

export type DaySlots = {
  dayKey: string;
  slots: Slot[];
  /**
   * Why the day is empty, when it is empty and the reason is interesting.
   * Renders as a line on the day rather than leaving a blank column that looks
   * like a loading failure.
   */
  closedReason: string | null;
};

export type GenerateInput = {
  dayKey: string;
  rules: AvailabilityRule[];
  /** Day key to reason. A present key means the whole day is off. */
  blocked: Map<string, string | null>;
  /** Confirmed bookings overlapping the range being generated. */
  busy: BusyInterval[];
  now: Date;
  calendar: SlotRules;
};

/**
 * Whether a candidate meeting collides with something already booked.
 *
 * Each side carries its own buffer: the booked meeting the one it was taken
 * under, the candidate the calendar's current one. That asymmetry is the point
 * — shortening the buffer today must not make yesterday's bookings retroactively
 * overlap, and it is the same comparison the exclusion constraint performs.
 */
function collides(
  startMs: number,
  endMs: number,
  busy: BusyInterval[],
  bufferMinutes: number,
): boolean {
  const candidateBuffer = bufferMinutes * MS_PER_MINUTE;

  return busy.some((interval) => {
    const busyStart = Date.parse(interval.start_time);
    const busyEnd = Date.parse(interval.end_time);
    const busyBuffer =
      (interval.buffer_minutes ?? bufferMinutes) * MS_PER_MINUTE;

    return startMs < busyEnd + busyBuffer && busyStart < endMs + candidateBuffer;
  });
}

/** Every open slot on one calendar day. */
export function generateDay({
  dayKey,
  rules,
  blocked,
  busy,
  now,
  calendar,
}: GenerateInput): DaySlots {
  if (blocked.has(dayKey)) {
    return {
      dayKey,
      slots: [],
      closedReason: blocked.get(dayKey)?.trim() || "Unavailable",
    };
  }

  const dayOfWeek = dayOfWeekOf(dayKey);
  const applicable = rules
    .filter((rule) => rule.active && rule.day_of_week === dayOfWeek)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  if (applicable.length === 0) {
    return { dayKey, slots: [], closedReason: null };
  }

  const durationMs = calendar.durationMinutes * MS_PER_MINUTE;
  /** Slots start this far apart: the meeting, then the buffer. */
  const cadence = calendar.durationMinutes + calendar.bufferMinutes;
  const earliest = now.getTime() + calendar.minNoticeMinutes * MS_PER_MINUTE;
  const byStart = new Map<string, Slot>();

  for (const rule of applicable) {
    const opens = parseTimeOfDay(rule.start_time);
    const closes = parseTimeOfDay(rule.end_time);

    // `<=` so a 9-to-5 rule offers the slot that ends exactly at 5. The buffer
    // is not required to fit inside the window — it protects the next meeting,
    // and there is no next meeting after the day closes.
    for (
      let minute = opens;
      minute + calendar.durationMinutes <= closes;
      minute += cadence
    ) {
      const start = zonedTimeToUtc(dayKey, minute);
      const startMs = start.getTime();
      const endMs = startMs + durationMs;

      if (startMs < earliest) continue;
      if (collides(startMs, endMs, busy, calendar.bufferMinutes)) continue;

      // Keyed so two overlapping rules can't offer the same time twice.
      const iso = start.toISOString();
      byStart.set(iso, { start: iso, end: new Date(endMs).toISOString() });
    }
  }

  return {
    dayKey,
    slots: [...byStart.values()].sort((a, b) => a.start.localeCompare(b.start)),
    closedReason: null,
  };
}

/** `generateDay` across a list of day keys, in the order given. */
export function generateDays(
  dayKeys: string[],
  input: Omit<GenerateInput, "dayKey">,
): DaySlots[] {
  return dayKeys.map((dayKey) => generateDay({ ...input, dayKey }));
}

/** The end instant for a meeting starting at `start` on a calendar. */
export function meetingEnd(start: Date, durationMinutes: number): Date {
  return new Date(start.getTime() + durationMinutes * MS_PER_MINUTE);
}

/** The three numbers the generator reads, from a calendar row. */
export function slotRulesOf(calendar: {
  duration_minutes: number;
  buffer_minutes: number;
  min_notice_minutes: number;
}): SlotRules {
  return {
    durationMinutes: calendar.duration_minutes,
    bufferMinutes: calendar.buffer_minutes,
    minNoticeMinutes: calendar.min_notice_minutes,
  };
}
