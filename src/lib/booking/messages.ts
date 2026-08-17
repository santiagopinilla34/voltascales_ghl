import { MEETING_NAME } from "@/lib/booking/slots";

/**
 * Every message a client gets about their booking, in one place.
 *
 * Client-safe, and that is the point: the sender in `src/lib/notify/booking.ts`
 * and the preview on the Settings page both build from here. They used to
 * assemble the text separately — the preview carried its own copy of the SMS
 * body with a comment conceding the duplication — which meant the screen
 * showing you what a stranger would receive was only as accurate as the last
 * person to remember to update both.
 *
 * ## Why the email is short
 *
 * The confirmation email used to be a letter: greeting, duration, the notes
 * they typed, join link, cancel link, sign-off. That shape asks to be replied
 * to, and a reply to a transactional address is a message nobody reads.
 *
 * The email now states the fact and offers one action. The SMS stays longer
 * and carries the join link, because it is the message that actually gets read
 * in the minute before a call.
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
 * takes the confirmation from two segments to four. Every client-facing SMS
 * built here is deliberately ASCII for the same reason.
 */
export function signature(settings: {
  booking_host_name: string | null;
  business_name: string | null;
}): string {
  const host = settings.booking_host_name?.trim();
  const business = settings.business_name?.trim() || "VoltaScales";

  return host ? `- ${host} from ${business}` : `- ${business}`;
}

/** The brand a message leads with. */
export function brandOf(businessName: string | null | undefined): string {
  return businessName?.trim() || "VoltaScales";
}

/** Bodies are trimmed of the empty lines a missing link would leave behind. */
function joinLines(lines: (string | null)[]): string {
  return lines.filter((line) => line !== null).join("\n");
}

export type MessageInput = {
  firstName: string;
  /** The long, spelled-out time. */
  when: string;
  /** The short form, for subjects. */
  date: string;
  /** Cancel URL, or null when the app doesn't know its own origin. */
  cancel: string | null;
  /** Meeting link from Settings, or null. */
  join: string | null;
  /** App origin, for the rebook link. */
  base: string | null;
  /** Phone to fall back to when there is no meeting link. */
  phone: string;
  businessName: string | null;
  signOff: string;
};

/**
 * The confirmation text.
 *
 * Longer than the email on purpose. This is the message that survives on a
 * phone until the call starts, so the join link leads: it is the one thing
 * they need at the moment it begins, and the one thing they will scroll back
 * to find.
 */
export function confirmationSms(input: MessageInput): string {
  return joinLines([
    `Thanks for booking, ${input.firstName}! Your ${MEETING_NAME} is ${input.when}.`,
    "",
    input.join ? `Here's the link to join:\n${input.join}` : null,
    input.join ? "" : null,
    input.cancel
      ? `Need to cancel? ${input.cancel}`
      : "Reply here if you need to change it.",
    "",
    input.signOff,
  ]);
}

/**
 * The confirmation email: the fact, and one action.
 *
 * Leads with the business name rather than a greeting, so the first line
 * identifies the sender even in a preview pane. The one link is the cancel
 * link, which is the only thing a client can actually self-serve — and it
 * points back into the app rather than inviting a reply to an address nobody
 * watches.
 */
export function confirmationEmail(input: MessageInput): {
  subject: string;
  text: string;
} {
  const brand = brandOf(input.businessName);

  return {
    subject: `${brand}: booked for ${input.date}`,
    text: joinLines([
      `${brand}: Booked for ${input.when}.`,
      "",
      input.cancel
        ? `Need to change it?\n${input.cancel}`
        : "Need to change it? Reply to the text you just got.",
      "",
      input.signOff,
    ]),
  };
}

/** The cancellation text. */
export function cancellationSms(input: MessageInput): string {
  return joinLines([
    `Your ${MEETING_NAME} on ${input.when} is cancelled.`,
    "",
    input.base
      ? `Want another time? ${input.base}/book`
      : "Reply here to pick another time.",
    "",
    input.signOff,
  ]);
}

/**
 * The cancellation email, in the same shape as the confirmation.
 *
 * Its one action is rebooking rather than cancelling, for obvious reasons, and
 * it is a real working link to the booking page — the same standard the
 * confirmation is held to.
 */
export function cancellationEmail(input: MessageInput): {
  subject: string;
  text: string;
} {
  const brand = brandOf(input.businessName);

  return {
    subject: `${brand}: cancelled — ${input.date}`,
    text: joinLines([
      `${brand}: Your ${MEETING_NAME} on ${input.when} is cancelled.`,
      "",
      input.base
        ? `Want another time?\n${input.base}/book`
        : "Reply to the text you just got to pick another time.",
      "",
      input.signOff,
    ]),
  };
}
