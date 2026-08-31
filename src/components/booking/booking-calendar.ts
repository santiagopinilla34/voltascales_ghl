/**
 * Client-safe helpers for the calendar screens.
 *
 * The `BookingCalendar` type used to live here as a front-end-only shape. It is
 * a database row now — `Tables<"calendars">` in `@/types/database` — and what
 * is left in this file is the handful of pure functions and labels the client
 * components need. No `server-only`: `slugify` runs in the New calendar dialog
 * as you type, and `lib/booking/calendars.ts` imports it back so the handle the
 * form previews and the handle the action writes are produced by one function.
 */

/**
 * The people who can be put on a calendar.
 *
 * A constant because the app has no user records yet — one account, one name,
 * the one used everywhere else in the product copy. The pickers widen it with
 * whoever is already on a calendar, so an account that has typed other names
 * keeps them. When there are real users this becomes a query.
 */
export const TEAM_MEMBERS = ["Aleck"] as const;

/** The working week `createCalendar` seeds a new calendar with. */
export const DEFAULT_AVAILABILITY = "Weekdays, 9:00 AM to 5:00 PM";

/** Initials for an avatar, from however many words a name happens to have. */
export function memberInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * URL-safe handle from a display name, so the slug is never hand-typed.
 *
 * Mirrors `calendars_slug_shape`, the CHECK constraint: lower-case
 * alphanumerics in hyphen-separated runs. The action re-derives it from
 * whatever the form sends rather than trusting this ran.
 */
export function slugify(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 48);

  return cleaned || "calendar";
}

/** The public booking link for a calendar, from an origin the server resolved. */
export function schedulingLink(origin: string, slug: string): string {
  return `${origin}/book/${slug}`;
}

/**
 * The link that survives a handle change.
 *
 * Ids do not move; slugs do. Anything pasted into a funnel or an ad should use
 * this one, which is why both are on the Share dialog rather than only the
 * pretty one.
 */
export function permanentLink(origin: string, id: string): string {
  return `${origin}/book/id/${id}`;
}
