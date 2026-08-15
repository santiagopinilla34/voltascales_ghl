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
 */

import type { AvailabilityRule } from "@/types/database";

import { dayOfWeekOf, parseTimeOfDay, zonedTimeToUtc } from "./time";

/** The one meeting type. */
export const MEETING_NAME = "Discovery Call";
export const MEETING_DURATION_MINUTES = 60;

/**
 * Dead time after a meeting, before the next one can start.
 *
 * Mirrored in the database by `public.booking_span()`, the function the
 * `bookings_no_overlap` exclusion constraint indexes. Change one and you must
 * change the other, or the database will start rejecting slots this file
 * offers. The duplication is forced: an index expression has to be IMMUTABLE,
 * which is what pushed the arithmetic into a function of its own.
 */
export const MEETING_BUFFER_MINUTES = 15;

/** Slots start this far apart: the meeting, then the buffer. */
export const SLOT_CADENCE_MINUTES =
  MEETING_DURATION_MINUTES + MEETING_BUFFER_MINUTES;

/**
 * How far ahead the calendar goes.
 *
 * Not in the spec, but an unbounded booking page will eventually take a meeting
 * eighteen months out from someone who will not be thinking about it by then.
 * Eight weeks is long enough for any real discovery call.
 */
export const BOOKING_HORIZON_DAYS = 56;

const MS_PER_MINUTE = 60_000;
const BUFFER_MS = MEETING_BUFFER_MINUTES * MS_PER_MINUTE;
const DURATION_MS = MEETING_DURATION_MINUTES * MS_PER_MINUTE;

/** Just enough of a booking row to know what it occupies. */
export type BusyInterval = { start_time: string; end_time: string };

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
  minNoticeMinutes: number;
};

/** Whether a candidate meeting collides with something already booked. */
function collides(startMs: number, endMs: number, busy: BusyInterval[]): boolean {
  return busy.some((interval) => {
    const busyStart = Date.parse(interval.start_time);
    const busyEnd = Date.parse(interval.end_time);

    // Both sides carry the buffer on their end, matching the ranges the
    // exclusion constraint compares. Back-to-back is a collision; a meeting
    // ending at 10:00 leaves the next one free to start at 10:15.
    return startMs < busyEnd + BUFFER_MS && busyStart < endMs + BUFFER_MS;
  });
}

/** Every open slot on one calendar day. */
export function generateDay({
  dayKey,
  rules,
  blocked,
  busy,
  now,
  minNoticeMinutes,
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

  const earliest = now.getTime() + minNoticeMinutes * MS_PER_MINUTE;
  const byStart = new Map<string, Slot>();

  for (const rule of applicable) {
    const opens = parseTimeOfDay(rule.start_time);
    const closes = parseTimeOfDay(rule.end_time);

    // `<=` so a 9-to-5 rule offers the slot that ends exactly at 5. The buffer
    // is not required to fit inside the window — it protects the next meeting,
    // and there is no next meeting after the day closes.
    for (
      let minute = opens;
      minute + MEETING_DURATION_MINUTES <= closes;
      minute += SLOT_CADENCE_MINUTES
    ) {
      const start = zonedTimeToUtc(dayKey, minute);
      const startMs = start.getTime();
      const endMs = startMs + DURATION_MS;

      if (startMs < earliest) continue;
      if (collides(startMs, endMs, busy)) continue;

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

/** The end instant for a meeting starting at `start`. */
export function meetingEnd(start: Date): Date {
  return new Date(start.getTime() + DURATION_MS);
}
