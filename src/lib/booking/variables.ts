import { MEETING_NAME } from "@/lib/booking/slots";
import { formatBookingDate, formatBookingTime, signature } from "@/lib/booking/messages";
import { formatPhone } from "@/lib/format";
import type { Booking, Contact, Settings } from "@/types/database";

/**
 * The `{{variables}}` a booking rule can use.
 *
 * Client-safe, because the automation editor lists them next to the template
 * box — a variable you cannot discover is a variable nobody uses.
 *
 * ## Why some of these are whole blocks
 *
 * `template.ts` is deliberately not a template *engine*: no conditionals, no
 * loops, on the grounds that anything more expressive is a way to get a broken
 * message sent to a customer. That rule is right and this module keeps it.
 *
 * But the messages it replaces did have conditions — the join link only
 * appears when a meeting link is set, the notes line only when the client
 * typed something, the inbox link only when the app knows its own origin. The
 * way to keep both is to resolve the condition *here* and expose the result as
 * a variable that is either a finished block of text or an empty string. The
 * template stays a flat substitution; the logic stays in code where it can be
 * typechecked.
 *
 * So `{{notes_block}}` is either "" or "They wrote:\n\n<the notes>". Dropping
 * it into a template is safe in both cases, and the surrounding blank lines
 * collapse because `renderTemplate` trims.
 */

export type BookingVariableDoc = {
  name: string;
  description: string;
  /** Blocks resolve to nothing when their condition isn't met. */
  block?: boolean;
};

/**
 * What the editor shows. Ordered as they are most likely to be reached for
 * rather than alphabetically — the client's name and the time first, the
 * conditional blocks last.
 */
export const BOOKING_VARIABLES: BookingVariableDoc[] = [
  { name: "first_name", description: "The client's first name, from the booking form." },
  { name: "client_name", description: "Their full name." },
  { name: "booking_time", description: "Tuesday, August 18 at 2:00 p.m. Eastern" },
  { name: "booking_date", description: "Tue, Aug 18 — short, for subject lines." },
  { name: "meeting_name", description: `What the meeting is called ("${MEETING_NAME}").` },
  { name: "business_name", description: "Your business name, from My Business." },
  { name: "sign_off", description: "- Aleck from VoltaScales, per Settings." },
  { name: "client_phone", description: "Their phone, formatted." },
  { name: "client_email", description: "Their email address." },
  { name: "cancel_url", description: "Link that cancels this booking. Empty if the app doesn't know its own URL." },
  { name: "meeting_link", description: "The join link from Settings, if one is set." },
  { name: "notes", description: "Whatever they typed in the notes box." },
  {
    name: "cancel_line",
    description: 'One line: "Need to cancel? <link>", or a reply-instead line when there is no link.',
    block: true,
  },
  {
    name: "cancel_block",
    description: 'Two lines: "Need to change it?" and the link on its own line.',
    block: true,
  },
  {
    name: "join_block",
    description: 'The join link with its "Here\'s the link to join:" line. Empty when no meeting link is set.',
    block: true,
  },
  {
    name: "rebook_line",
    description: "One line offering the booking page again. For a cancellation text.",
    block: true,
  },
  {
    name: "rebook_block",
    description: "The same offer over two lines, with the link on its own. For a cancellation email.",
    block: true,
  },
  {
    name: "notes_block",
    description: 'Their notes under a "They wrote:" line. Empty when they left it blank.',
    block: true,
  },
  {
    name: "pipeline_block",
    description: "Where this left them on the pipeline, or a warning when no contact was linked.",
    block: true,
  },
  {
    name: "inbox_link",
    description: "Link to their conversation. Empty when the app doesn't know its own URL, or no contact was linked.",
    block: true,
  },
];

/**
 * Builds the variable set for one booking.
 *
 * `cancelled` changes only the pipeline wording — cancelling does not move
 * someone back down the pipeline, and saying so is the whole point of that
 * line. Everything else is shared, because the confirmation and cancellation
 * are separate rules with their own templates and do not need the same
 * sentence to mean two things.
 */
export function bookingVariables({
  booking,
  contact,
  settings,
  baseUrl,
  cancelled,
}: {
  booking: Booking;
  contact: Contact | null;
  settings: Settings | null;
  baseUrl: string | null;
  cancelled: boolean;
}): Record<string, string> {
  const when = formatBookingTime(booking);
  const cancelUrl = baseUrl ? `${baseUrl}/book/cancel/${booking.cancel_token}` : "";
  const join = settings?.booking_meeting_link?.trim() ?? "";
  const notes = booking.notes?.trim() ?? "";

  return {
    first_name: booking.client_name.trim().split(/\s+/)[0] ?? "",
    client_name: booking.client_name,
    booking_time: when,
    booking_date: formatBookingDate(booking),
    meeting_name: MEETING_NAME,
    business_name: settings?.business_name?.trim() || "VoltaScales",
    sign_off: settings
      ? signature(settings)
      : "- VoltaScales",
    client_phone: formatPhone(booking.client_phone),
    client_email: booking.client_email,
    cancel_url: cancelUrl,
    meeting_link: join,
    notes,

    // The blocks. Each is a finished piece of text or nothing at all.
    cancel_line: cancelUrl
      ? `Need to cancel? ${cancelUrl}`
      : "Reply here if you need to change it.",
    cancel_block: cancelUrl
      ? `Need to change it?\n${cancelUrl}`
      : "Need to change it? Reply to the text you just got.",
    // Carries its own trailing blank line rather than relying on one in the
    // template. A block that renders to nothing has to take its separator with
    // it — otherwise the template needs a newline between the block and what
    // follows, and that newline is still there on the day the block is empty,
    // leaving a stray blank line in every message without a meeting link.
    join_block: join ? `Here's the link to join:\n${join}\n\n` : "",
    rebook_line: baseUrl
      ? `Want another time? ${baseUrl}/book`
      : "Reply here to pick another time.",
    rebook_block: baseUrl
      ? `Want another time?\n${baseUrl}/book`
      : "Reply to the text you just got to pick another time.",
    notes_block: notes ? `\nThey wrote:\n\n${notes}\n` : "",
    pipeline_block: contact
      ? cancelled
        ? "\nThey are still on the pipeline where they were - cancelling does not move them back.\n"
        : "\nThey have been moved to Booked on the pipeline.\n"
      : // Worth saying out loud: the meeting is real but nothing in the CRM
        // points at it, so it will not show up where you would go looking.
        "\nNo contact record was linked to this booking - check the logs. The meeting itself is fine.\n",
    inbox_link: contact && baseUrl ? `\n${baseUrl}/inbox/${contact.id}` : "",
  };
}
