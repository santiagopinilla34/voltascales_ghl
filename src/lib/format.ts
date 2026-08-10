/**
 * Display formatting shared by the dashboard pages.
 *
 * Every timestamp is rendered in one fixed zone rather than the viewer's. These
 * helpers run on the server (in Server Components) and on the client (for a
 * message that was just sent), and `toLocaleString` without an explicit zone
 * would resolve to UTC on Vercel and to local time in the browser — the same
 * row would render differently in each, which React reports as a hydration
 * mismatch. A single-user app has one operator in one place, so pinning the
 * zone is both correct and simpler than passing offsets around.
 */
const TIME_ZONE = "America/Toronto";
const LOCALE = "en-CA";

const timeOnly = new Intl.DateTimeFormat(LOCALE, {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});

const dayAndMonth = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  timeZone: TIME_ZONE,
});

const dayMonthYear = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const fullStamp = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});

/** Calendar day in TIME_ZONE, as `YYYY-MM-DD`, for same-day comparisons. */
function zonedDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

function daysBetween(a: Date, b: Date): number {
  const [dayA, dayB] = [zonedDayKey(a), zonedDayKey(b)];
  return Math.round(
    (Date.parse(`${dayB}T00:00:00Z`) - Date.parse(`${dayA}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Compact stamp for list rows: the time if it happened today, a weekday name
 * within the last week, then a date. Mirrors how a phone shows a thread list.
 */
export function formatListTimestamp(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const elapsed = daysBetween(date, now);

  if (elapsed === 0) return timeOnly.format(date);
  if (elapsed === 1) return "Yesterday";
  if (elapsed < 7) {
    return new Intl.DateTimeFormat(LOCALE, {
      weekday: "short",
      timeZone: TIME_ZONE,
    }).format(date);
  }
  if (date.getUTCFullYear() === now.getUTCFullYear()) return dayAndMonth.format(date);
  return dayMonthYear.format(date);
}

/** Time under a message bubble. */
export function formatMessageTime(iso: string): string {
  return timeOnly.format(new Date(iso));
}

/** Heading that separates one day's messages from the next in a thread. */
export function formatDayDivider(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const elapsed = daysBetween(date, now);

  if (elapsed === 0) return "Today";
  if (elapsed === 1) return "Yesterday";
  if (date.getUTCFullYear() === now.getUTCFullYear()) return dayAndMonth.format(date);
  return dayMonthYear.format(date);
}

/** Unabbreviated stamp, for tooltips and detail rows. */
export function formatFullTimestamp(iso: string): string {
  return fullStamp.format(new Date(iso));
}

/** Groups consecutive messages under one day heading. */
export function dayKeyOf(iso: string): string {
  return zonedDayKey(new Date(iso));
}

/**
 * Renders E.164 as a North American number when it looks like one, and returns
 * anything else untouched — a `+44` number formatted with NANP grouping would
 * be worse than leaving it alone.
 */
export function formatPhone(phone: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : phone;
}

/** What to call a contact: their name, or their number until we learn it. */
export function contactLabel(contact: {
  name: string | null;
  phone: string;
}): string {
  return contact.name?.trim() || formatPhone(contact.phone);
}

/** Up to two letters for the avatar fallback. */
export function contactInitials(contact: {
  name: string | null;
  phone: string;
}): string {
  const name = contact.name?.trim();

  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const letters =
      parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0].slice(0, 2);
    return letters.toUpperCase();
  }

  // Last two digits distinguish unnamed contacts better than the country code.
  return contact.phone.replace(/\D/g, "").slice(-2) || "?";
}
