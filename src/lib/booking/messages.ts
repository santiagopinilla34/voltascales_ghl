/**
 * How a booking is written down: times, and who the message is from.
 *
 * The message bodies used to live here too. They are automation templates now
 * — seeded by `20260816030000_seed_system_automations.sql`, edited on the
 * Automations page — and the builders that assembled them have been deleted
 * rather than kept around. A second copy of wording that is editable elsewhere
 * is a copy that will disagree with the real one within a week, and the whole
 * point of the move was to have exactly one place the text lives.
 *
 * What is left is the formatting the templates cannot do for themselves, fed
 * to them as variables by `./variables.ts`.
 *
 * Client-safe.
 */

/** Times as the client should read them: Eastern, spelled out. */
const stamp = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "America/Toronto",
});

/**
 * The compact form, for subject lines.
 *
 * A subject is truncated to roughly 35 characters in most mobile inboxes, so
 * "Tuesday, August 18 at 2:00 p.m. Eastern" would be cut off around "at". The
 * day and date are what someone scanning needs; the exact time is one tap away
 * in the body.
 */
const shortStamp = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "America/Toronto",
});

export function formatBookingTime(booking: { start_time: string }): string {
  return `${stamp.format(new Date(booking.start_time))} Eastern`;
}

export function formatBookingDate(booking: { start_time: string }): string {
  return shortStamp.format(new Date(booking.start_time));
}

/**
 * How the client-facing messages introduce themselves.
 *
 * Signed by a person where one is configured, because these are messages to
 * someone about to take a call with you: "Aleck from VoltaScales" reads like
 * the person they are meeting, "VoltaScales" reads like a marketing blast, and
 * people reply to the first and ignore the second.
 *
 * A plain hyphen, not an em dash, and that is a billing decision rather than a
 * typographic one. A single character outside GSM-7 switches the whole message
 * to UCS-2, which cuts an SMS segment from 153 characters to 67 — one em dash
 * takes the confirmation from two segments to four. This is why the seeded SMS
 * templates are deliberately ASCII, and why the editor warns when an edit
 * introduces a character that isn't.
 */
export function signature(settings: {
  booking_host_name: string | null;
  business_name: string | null;
}): string {
  const host = settings.booking_host_name?.trim();
  const business = settings.business_name?.trim() || "VoltaScales";

  return host ? `- ${host} from ${business}` : `- ${business}`;
}
