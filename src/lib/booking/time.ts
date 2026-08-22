/**
 * Wall-clock arithmetic in the app's time zone.
 *
 * `format.ts` only ever formats instants for display, which `Intl` does on its
 * own. Slot generation needs the harder direction — "9am on Tuesday the 3rd,
 * in Toronto, is which absolute instant?" — and that depends on whether
 * daylight saving is in effect on that particular date, which no `Date` method
 * will tell you about a zone other than the host's.
 *
 * Hand-rolled rather than pulling in a date library: this is about sixty lines,
 * it has no dependencies, and the alternative is a package whose whole job is
 * the two functions below. `Temporal` will make this file deletable when it
 * lands in stable Node.
 *
 * Client-safe — no `server-only` — because the booking widget renders slot
 * labels in the browser.
 *
 * A "day key" throughout this file is a calendar date as `YYYY-MM-DD`, in
 * TIME_ZONE. It is the same string Postgres uses for `date`, which is why
 * `blocked_dates.date` can be compared to one without parsing.
 */

import { TIME_ZONE } from "@/lib/format";

export const MINUTES_PER_DAY = 24 * 60;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * `longOffset` renders as `GMT-04:00`, or bare `GMT` at zero. Asking for the
 * offset this way, rather than diffing two formatted dates, means the runtime's
 * own tz database answers the DST question.
 */
const offsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  timeZoneName: "longOffset",
});

/** `YYYY-MM-DD` in TIME_ZONE. `en-CA` formats dates in exactly that order. */
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The zone's offset from UTC at a given instant, in milliseconds. */
function zoneOffsetMs(instant: Date): number {
  const name = offsetFormat
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = name ? /GMT([+-])(\d{2}):(\d{2})/.exec(name) : null;
  if (!match) return 0; // Bare "GMT", i.e. the zone is on UTC right now.

  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "-" ? -minutes : minutes) * MS_PER_MINUTE;
}

/** The calendar date an instant falls on, in TIME_ZONE. */
export function dayKeyOf(instant: Date): string {
  return dayKeyFormat.format(instant);
}

/** Today's date in TIME_ZONE. */
export function todayDayKey(now: Date = new Date()): string {
  return dayKeyOf(now);
}

/**
 * Converts a wall-clock time in TIME_ZONE to the absolute instant it names.
 *
 * Two passes, and the second one is not optional. The first guesses the offset
 * using the wall time read as if it were UTC, which lands on the wrong side of
 * a DST boundary for times within a few hours of the transition; the second
 * re-reads the offset at the instant the first pass produced and corrects.
 *
 * The transitions themselves are genuinely ambiguous, and this resolves them
 * rather than throwing. On the spring-forward day 2:30am does not exist and
 * resolves backwards to 1:30am EST; on the fall-back day 1:30am happens twice
 * and this returns the first. Neither is reachable from a 9-to-5 availability
 * rule, and both beat an exception in front of someone booking a meeting.
 */
export function zonedTimeToUtc(dayKey: string, minutesFromMidnight: number): Date {
  const asIfUtc = Date.parse(`${dayKey}T00:00:00Z`) + minutesFromMidnight * MS_PER_MINUTE;

  const firstPass = asIfUtc - zoneOffsetMs(new Date(asIfUtc));
  const corrected = asIfUtc - zoneOffsetMs(new Date(firstPass));

  return new Date(corrected);
}

/** Minutes since midnight in TIME_ZONE, the inverse of `zonedTimeToUtc`. */
export function minutesFromMidnightOf(instant: Date): number {
  const local = instant.getTime() + zoneOffsetMs(instant);
  const midnight = Date.parse(`${dayKeyOf(instant)}T00:00:00Z`);
  return Math.round((local - midnight) / MS_PER_MINUTE);
}

/**
 * Day of week for a day key. 0 = Sunday, matching `Date.getDay()` and
 * `availability_rules.day_of_week`.
 *
 * Safe to read in UTC: a day key is a calendar date with no instant attached,
 * so parsing it at midnight UTC asks which weekday that date is, not which
 * weekday it is anywhere in particular.
 */
export function dayOfWeekOf(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00Z`).getUTCDay();
}

/** A day key `days` later (or earlier, if negative). */
export function addDays(dayKey: string, days: number): string {
  const shifted = new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, by calendar date rather than elapsed time. */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY,
  );
}

/**
 * The Monday on or before a day key.
 *
 * Monday rather than Sunday because the week view is for booking a working
 * week, and a calendar that opens with the weekend wastes its first column.
 * Note this is the one place the 0-is-Sunday convention is deliberately not
 * used for layout — the storage convention still is.
 */
export function startOfWeek(dayKey: string): string {
  const dow = dayOfWeekOf(dayKey);
  return addDays(dayKey, dow === 0 ? -6 : 1 - dow);
}

/** The seven day keys of the week containing `dayKey`, Monday first. */
export function weekOf(dayKey: string): string[] {
  const monday = startOfWeek(dayKey);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** The first day of the month containing `dayKey`. */
export function startOfMonth(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`;
}

/**
 * `months` later, clamped to the last day of the target month.
 *
 * The clamp is the whole reason this exists rather than adding 30 days:
 * stepping forward from the 31st of a 31-day month lands on a date the next
 * month does not have, and `Date` silently rolls that into the month after —
 * so "next month" from March 31st would show May.
 */
export function addMonths(dayKey: string, months: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();

  const target = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), Math.min(day, lastDay)),
  );
  return target.toISOString().slice(0, 10);
}

/** Every day key in the month containing `dayKey`, 1st to last. */
export function monthOf(dayKey: string): string[] {
  const first = startOfMonth(dayKey);
  const [year, month] = first.split("-").map(Number);
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Array.from({ length }, (_, index) => addDays(first, index));
}

/**
 * How many blank cells precede the 1st in a Monday-first grid.
 *
 * The calendar is drawn as seven columns starting on Monday, so a month
 * beginning on a Thursday needs three empty cells before it — otherwise every
 * date sits under the wrong weekday, which is worse than useless on a page
 * whose entire job is telling someone which day they picked.
 */
export function leadingBlanks(dayKey: string): number {
  const dow = dayOfWeekOf(startOfMonth(dayKey));
  return dow === 0 ? 6 : dow - 1;
}

/** `"09:00:00"` (Postgres `time`) to minutes since midnight. */
export function parseTimeOfDay(value: string): number {
  const [hours, minutes] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** Minutes since midnight back to `"HH:MM"`, for `time` columns and inputs. */
export function formatTimeOfDay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
