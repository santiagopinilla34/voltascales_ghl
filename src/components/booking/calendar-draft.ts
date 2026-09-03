import type { AvailabilityRule, BookingCalendar } from "@/types/database";

/**
 * Everything the calendar editor edits, in one shape.
 *
 * Client-safe, and deliberately a *draft* rather than a row: the editor is
 * front-end only for now, so this is what the screen holds in React between
 * opening it and reloading the page. When it grows a backend, this is the type
 * the action takes, and `fromCalendar` below becomes the half that stays.
 *
 * Seeded from the real calendar wherever the two overlap. Five of these fields
 * are already columns — the name, the description, the handle, the group, the
 * meeting length, the buffer and the minimum notice — and showing a form full
 * of defaults next to a calendar that already has values would make the screen
 * read as broken before anybody typed anything. The rest start at the value the
 * upstream product starts them at.
 */

export type MeetingLocationKind = "phone" | "address" | "custom" | "ask";

export const MEETING_LOCATIONS: {
  value: MeetingLocationKind;
  label: string;
  /** Whether the row has a value to type. "Ask the booker" does not. */
  takesValue: boolean;
  placeholder: string;
}[] = [
  {
    value: "phone",
    label: "Phone",
    takesValue: true,
    placeholder: "Number to call",
  },
  {
    value: "address",
    label: "Full address",
    takesValue: true,
    placeholder: "Street, city, postal code",
  },
  {
    value: "custom",
    label: "Custom",
    takesValue: true,
    placeholder: "Enter location value",
  },
  {
    value: "ask",
    label: "Ask the booker (booker enters the location)",
    takesValue: false,
    placeholder: "",
  },
];

/**
 * The video options, named and refused.
 *
 * Shown greyed under their own heading rather than left off the menu, because
 * "can this calendar be a Zoom call" is a question somebody will ask the menu,
 * and a menu that simply omits them answers "no such thing" instead of "not
 * yet". Neither has an integration behind it — there is no Zoom or Google
 * connection anywhere in this app — so both are dead by construction.
 */
export const UNSUPPORTED_LOCATIONS = ["Zoom", "Google Meet"] as const;

export type MeetingLocation = {
  id: string;
  kind: MeetingLocationKind;
  value: string;
  /** Null until "Add display label" is clicked; "" once it has been. */
  label: string | null;
};

export type HourRange = { id: string; start: string; end: string };

/** One weekday. `active: false` is the "Unavailable" row. */
export type DayHours = { active: boolean; ranges: HourRange[] };

/** A one-off override for a single date. */
export type DateSpecificHours = { id: string; date: string; ranges: HourRange[] };

export type TimeUnit = "Minutes" | "Hours";
export type Amount = { amount: string; unit: TimeUnit };

/** A meeting length. More than one is offered to the booker as a choice. */
export type Duration = { id: string } & Amount;

export type CalendarDraft = {
  /**
   * What the drop zone shows: an object URL while a new file is pending, or the
   * stored public URL once one has been uploaded.
   */
  logo: string | null;
  logoName: string | null;
  /**
   * The picked file, held until Save. A logo used to be an object URL and
   * nothing else, which is why it vanished on reload — this is what actually
   * gets uploaded.
   */
  logoFile: File | null;
  /** Cleared the existing logo but has not saved yet. Distinct from never
   *  having had one, which needs no write at all. */
  logoRemoved: boolean;
  /** Follow the operator own hours instead of this calendar own. */
  syncAvailabilityFromUser: boolean;
  name: string;
  description: string;
  slug: string;
  groupId: string | null;
  inviteTitle: string;
  color: string;

  locations: MeetingLocation[];

  timeZone: string;
  /** Seven entries, index 0 is Sunday — matching `Date.getDay()` and the rules. */
  days: DayHours[];
  dateSpecific: DateSpecificHours[];
  recurring: boolean;

  interval: Amount;
  durations: Duration[];
  minNotice: { amount: string; unit: "Days" | "Hours" | "Minutes" };
  dateRange: { amount: string; unit: "Days" | "Months" };
  countAvailableDaysOnly: boolean;
  preBuffer: Amount;
  postBuffer: Amount;
  maxPerDay: string;
  maxPerSlot: string;
  lookBusy: boolean;
  lookBusyPercent: string;
};

/**
 * The colours a meeting can be.
 *
 * Hexes rather than Tailwind classes: they are data, they end up on a swatch
 * and eventually on a calendar block, and a class name cannot be stored in a
 * column later without being translated back.
 */
export const MEETING_COLORS = [
  "#dc2626",
  "#f87171",
  "#ea580c",
  "#eab308",
  "#4ade80",
  "#15803d",
  "#0ea5e9",
  "#2563eb",
  "#818cf8",
  "#a21caf",
  "#525252",
] as const;

export const DEFAULT_START = "09:00";
export const DEFAULT_END = "17:00";

/** Ids for rows the user adds. Never called during the first render. */
export function rowId(): string {
  return crypto.randomUUID();
}

/** Postgres hands back `09:00:00`; `<input type="time">` wants `09:00`. */
function hhmm(time: string): string {
  return time.slice(0, 5);
}

/**
 * The stored rules as seven editable days.
 *
 * Ids come from the rows, so the first render is deterministic — generating
 * them here would differ between the server pass and the client one and show up
 * as a hydration mismatch. Same reasoning, and the same code, as
 * `availability-schedule.tsx`; when this screen replaces that one, one of them
 * goes.
 */
function daysFromRules(rules: AvailabilityRule[]): DayHours[] {
  return Array.from({ length: 7 }, (_, day) => {
    const forDay = rules
      .filter((rule) => rule.day_of_week === day)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    return {
      active: forDay.some((rule) => rule.active),
      ranges: forDay.map((rule) => ({
        id: rule.id,
        start: hhmm(rule.start_time),
        end: hhmm(rule.end_time),
      })),
    };
  });
}

/**
 * Minutes as the largest whole unit that divides them.
 *
 * 90 minutes stays 90 minutes rather than becoming 1.5 hours, because the unit
 * select has no half — showing "1.5 Hours" would be a value the control cannot
 * produce and cannot round-trip.
 */
function asAmount(minutes: number): Amount {
  return minutes >= 60 && minutes % 60 === 0
    ? { amount: String(minutes / 60), unit: "Hours" }
    : { amount: String(minutes), unit: "Minutes" };
}

export function fromCalendar(
  calendar: BookingCalendar,
  rules: AvailabilityRule[],
  timeZone: string,
): CalendarDraft {
  return {
    logo: calendar.logo_url,
    logoName: null,
    logoFile: null,
    logoRemoved: false,
    syncAvailabilityFromUser: calendar.sync_availability_from_user,
    name: calendar.name,
    description: calendar.description ?? "",
    slug: calendar.slug,
    groupId: calendar.group_id,
    // The upstream default, and a sensible one: the invite a booker sees says
    // who it is with rather than repeating the calendar's own name.
    inviteTitle: "{{contact.name}}",
    color: MEETING_COLORS[0],

    // One empty Custom row, so the section opens on the shape of the thing
    // rather than on a bare Add button. No column stores this yet.
    locations: [{ id: "location-1", kind: "custom", value: "", label: null }],

    timeZone,
    days: daysFromRules(rules),
    dateSpecific: [],
    recurring: false,

    // The interval is how far apart slots start; with no column of its own it
    // mirrors the meeting length, which is what the generator does today.
    interval: asAmount(calendar.duration_minutes),
    durations: [{ id: "duration-1", ...asAmount(calendar.duration_minutes) }],
    minNotice: { amount: String(calendar.min_notice_minutes), unit: "Minutes" },
    dateRange: { amount: "", unit: "Days" },
    countAvailableDaysOnly: false,
    // The one buffer this app stores sits *after* a meeting — it protects the
    // next one — so it seeds the post field and leaves the pre field empty.
    preBuffer: { amount: "", unit: "Minutes" },
    postBuffer: asAmount(calendar.buffer_minutes),
    maxPerDay: "",
    maxPerSlot: "1",
    lookBusy: false,
    lookBusyPercent: "0",
  };
}
