/**
 * Grid arithmetic for the operator's calendar: which days a view covers, what
 * to call the range, and where each booking sits in a time column.
 *
 * Pure and client-safe, like `slots.ts` and for the same reason — the page
 * decides the window on the server so the query can be bounded, and the grid
 * renders it in the browser. Both use the functions here, so they cannot
 * disagree about which week "this week" is.
 *
 * Everything is in TIME_ZONE. A calendar rendered in the viewer's zone would
 * put a 9am meeting in a different cell depending on where the laptop is, and
 * this app pins one zone everywhere for exactly that reason.
 */

import { TIME_ZONE } from "@/lib/format";

import { addDays, dayOfWeekOf, minutesFromMidnightOf, weekOf } from "./time";

export type CalendarViewMode = "month" | "week" | "day";

export const VIEW_MODES: { value: CalendarViewMode; label: string }[] = [
  { value: "month", label: "Month view" },
  { value: "week", label: "Week view" },
  { value: "day", label: "Day view" },
];

export function isViewMode(value: string): value is CalendarViewMode {
  return value === "month" || value === "week" || value === "day";
}

/** `YYYY-MM-DD` and nothing else. Guards a hand-edited `?date=`. */
export function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** The first of the month a day key falls in. */
export function startOfMonth(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`;
}

/**
 * A day key `delta` months later, clamped to the last day of the target month.
 *
 * Clamping matters at the ends: stepping forward from 31 January into February
 * has no 31st to land on, and letting it roll over into March would skip the
 * month the operator asked for.
 */
export function addMonths(dayKey: string, delta: number): string {
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(5, 7)) - 1;
  const day = Number(dayKey.slice(8, 10));

  const target = new Date(Date.UTC(year, month + delta, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  const clamped = Math.min(day, lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

/**
 * The weeks a month view draws: whole Monday-to-Sunday rows covering the whole
 * month, so the grid is rectangular and the first row is not a ragged edge.
 *
 * Five or six rows depending on the month, never a fixed six — a padded sixth
 * row of greyed-out days is dead space on most months.
 */
export function monthGrid(anchor: string): string[][] {
  const first = startOfMonth(anchor);
  const monthPrefix = first.slice(0, 7);

  const start = weekOf(first)[0];
  const weeks: string[][] = [];

  for (let index = 0; index < 6; index += 1) {
    const week = weekOf(addDays(start, index * 7));
    weeks.push(week);

    // Stop once the row that finishes the month has been added. Testing the
    // last cell rather than the first: a week straddling the boundary still
    // belongs to this month's grid.
    if (week[6].slice(0, 7) > monthPrefix) break;
  }

  return weeks;
}

/** The days a view covers, in order. */
export function daysInView(view: CalendarViewMode, anchor: string): string[] {
  if (view === "day") return [anchor];
  if (view === "week") return weekOf(anchor);
  return monthGrid(anchor).flat();
}

/**
 * The window to query, as an inclusive pair of day keys.
 *
 * The month view's window is the grid's, not the month's: the leading and
 * trailing cells belong to neighbouring months and a meeting in one of them
 * still has to be drawn.
 */
export function rangeFor(
  view: CalendarViewMode,
  anchor: string,
): { from: string; to: string } {
  const days = daysInView(view, anchor);
  return { from: days[0], to: days[days.length - 1] };
}

/** Where the back and forward arrows go. */
export function shiftAnchor(
  view: CalendarViewMode,
  anchor: string,
  delta: number,
): string {
  if (view === "day") return addDays(anchor, delta);
  if (view === "week") return addDays(anchor, delta * 7);
  return addMonths(anchor, delta);
}

const monthYear = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const dayLong = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const monthDay = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * The label between the arrows: "August 2026", "Aug 9 – 15, 2026", or the full
 * date on a day view.
 *
 * Formatted in UTC on purpose, which looks wrong and is not: a day key is a
 * calendar date with no instant attached, so it is parsed at midnight UTC and
 * must be read back in the same zone it was parsed in. Formatting it in
 * TIME_ZONE would shift it a day west of Greenwich.
 */
export function rangeLabel(view: CalendarViewMode, anchor: string): string {
  const at = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`);

  if (view === "day") return dayLong.format(at(anchor));
  if (view === "month") return monthYear.format(at(startOfMonth(anchor)));

  const days = weekOf(anchor);
  const [first, last] = [days[0], days[6]];
  const year = last.slice(0, 4);

  return `${monthDay.format(at(first))} – ${
    // "Aug 9 – 15" when the week does not cross a month, "Aug 30 – Sep 5" when
    // it does.
    first.slice(0, 7) === last.slice(0, 7)
      ? last.slice(8).replace(/^0/, "")
      : monthDay.format(at(last))
  }, ${year}`;
}

/** Column headings for the week and month grids, Monday first. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Saturday and Sunday, for the weekend shading. */
export function isWeekend(dayKey: string): boolean {
  const dow = dayOfWeekOf(dayKey);
  return dow === 0 || dow === 6;
}

/** "GMT-04:00", for the corner of the time gutter. */
export function zoneLabel(now: Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value;

  return name ?? "GMT";
}

// ---------------------------------------------------------------------------
// Time-grid layout
// ---------------------------------------------------------------------------

/** Just enough of a booking for the geometry. */
export type Placeable = {
  id: string;
  start_time: string;
  end_time: string;
};

export type PlacedEvent<T extends Placeable> = {
  event: T;
  /** Minutes from midnight, clamped into the day. */
  startMinutes: number;
  endMinutes: number;
  /** Which of `columns` side-by-side lanes this one occupies, from 0. */
  column: number;
  /** How many lanes the overlapping cluster needs. */
  columns: number;
};

const MINUTES_PER_DAY = 24 * 60;

/**
 * Places one day's events into side-by-side lanes.
 *
 * Two meetings at the same time have to be drawn next to each other rather
 * than on top of each other, and the number of lanes is a property of the
 * whole overlapping cluster, not of a single event: three meetings where the
 * first two overlap each other and the third only overlaps the second all need
 * the same width, or the row looks broken.
 *
 * So it runs in two passes — greedily assign each event the first free lane,
 * tracking the cluster it belongs to, then give every event in a cluster the
 * cluster's lane count.
 *
 * Events are clamped to the day they are being drawn in. Nothing this app
 * books crosses midnight, but a hand-edited row could, and a negative height
 * is a rendering bug rather than a data one.
 */
export function layoutDay<T extends Placeable>(
  events: T[],
  dayKey: string,
): PlacedEvent<T>[] {
  const dayStart = Date.parse(`${dayKey}T00:00:00Z`);

  const spans = events
    .map((event) => {
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);

      // `minutesFromMidnightOf` answers for the day the instant falls on, so an
      // event from a neighbouring day has to be pushed to this day's edge
      // rather than trusted.
      const startsToday = Date.parse(`${dayKeyOfInstant(start)}T00:00:00Z`) === dayStart;
      const endsToday = Date.parse(`${dayKeyOfInstant(end)}T00:00:00Z`) === dayStart;

      const startMinutes = startsToday ? minutesFromMidnightOf(start) : 0;
      const endMinutes = endsToday ? minutesFromMidnightOf(end) : MINUTES_PER_DAY;

      return {
        event,
        startMinutes: Math.max(0, Math.min(MINUTES_PER_DAY, startMinutes)),
        // A zero-height block is invisible and unclickable; fifteen minutes is
        // the smallest thing worth drawing.
        endMinutes: Math.max(
          Math.min(MINUTES_PER_DAY, endMinutes),
          Math.min(MINUTES_PER_DAY, startMinutes + 15),
        ),
      };
    })
    .sort(
      (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
    );

  const placed: PlacedEvent<T>[] = [];

  /** Lane end times for the cluster being built. */
  let lanes: number[] = [];
  /** Indices into `placed` for the cluster being built. */
  let cluster: number[] = [];

  function closeCluster() {
    for (const index of cluster) placed[index].columns = lanes.length;
    lanes = [];
    cluster = [];
  }

  for (const span of spans) {
    // A cluster ends when an event starts after everything before it finished.
    if (lanes.length > 0 && lanes.every((end) => end <= span.startMinutes)) {
      closeCluster();
    }

    let column = lanes.findIndex((end) => end <= span.startMinutes);
    if (column === -1) {
      column = lanes.length;
      lanes.push(span.endMinutes);
    } else {
      lanes[column] = span.endMinutes;
    }

    cluster.push(placed.length);
    placed.push({ ...span, column, columns: 1 });
  }

  closeCluster();

  return placed;
}

/**
 * The calendar date an instant falls on, in TIME_ZONE.
 *
 * A local copy rather than importing `dayKeyOf` from `./time`, which would
 * shadow nothing but reads confusingly next to `layoutDay`'s own `dayKey`
 * parameter.
 */
function dayKeyOfInstant(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Groups events by the day they start on, for the month grid. */
export function groupByDay<T extends Placeable>(events: T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();

  for (const event of events) {
    const key = dayKeyOfInstant(new Date(event.start_time));
    const existing = byDay.get(key);
    if (existing) existing.push(event);
    else byDay.set(key, [event]);
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  return byDay;
}
