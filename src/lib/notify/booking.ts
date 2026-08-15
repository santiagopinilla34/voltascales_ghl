import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MEETING_NAME } from "@/lib/booking/slots";
import { appBaseUrl } from "@/lib/env";
import { formatPhone } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { sendSms } from "@/lib/twilio/client";
import type { Booking, Contact, Database } from "@/types/database";

import { sendEmail } from "./email";

/**
 * Everything that goes out when a booking is made or cancelled.
 *
 * Same posture as `handoff.ts`: none of this throws. The meeting is already on
 * the calendar by the time any of it runs, and a failed confirmation text must
 * not turn a booking that worked into an error the client sees. Failures are
 * logged with enough detail to chase by hand.
 *
 * Note the asymmetry between the two channels. SMS goes through your own Twilio
 * number, which can text anyone. Email goes through Resend, and on the default
 * `onboarding@resend.dev` sender it will only deliver to the address the Resend
 * account was registered with — i.e. to you, not to clients. Verify a domain and
 * set NOTIFY_FROM_EMAIL before relying on the client-facing email; until then
 * the SMS is what actually reaches them, which is why it carries the cancel
 * link too rather than deferring to the email.
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

export function formatBookingTime(booking: Pick<Booking, "start_time">): string {
  return `${stamp.format(new Date(booking.start_time))} Eastern`;
}

/**
 * The client's cancel link, or null when the app doesn't know its own origin.
 *
 * A dead link in a confirmation is worse than no link — someone who can't
 * cancel will simply not turn up — so an unset APP_BASE_URL drops the line
 * entirely and the message says to reply instead.
 */
export function cancelUrl(booking: Pick<Booking, "cancel_token">): string | null {
  const base = appBaseUrl();
  return base ? `${base}/book/cancel/${booking.cancel_token}` : null;
}

/** SMS bodies are trimmed of empty lines a missing link would leave behind. */
function joinLines(lines: (string | null)[]): string {
  return lines.filter((line) => line !== null).join("\n");
}

async function textClient(booking: Booking, body: string, label: string) {
  try {
    await sendSms(booking.client_phone, body);
    console.log(`[booking] ${label} texted to ${booking.client_phone}`);
  } catch (error) {
    console.error(
      `[booking] could not text the ${label} for booking ${booking.id} to ${booking.client_phone}`,
      error,
    );
  }
}

async function emailClient(booking: Booking, subject: string, text: string, label: string) {
  const result = await sendEmail({ to: booking.client_email, subject, text });

  if (!result.ok) {
    console.error(
      `[booking] could not email the ${label} for booking ${booking.id} to ` +
        `${booking.client_email}: ${result.error}`,
    );
    return;
  }
  console.log(`[booking] ${label} emailed to ${booking.client_email} [${result.id}]`);
}

/**
 * Tells the operator a booking came in.
 *
 * Reuses the `notify_me` pattern: the address comes from Settings, an unset one
 * means the alert is off rather than broken, and nothing here can fail the
 * booking. Includes the pipeline and inbox context that the client-facing
 * messages deliberately don't carry.
 */
async function notifyOperator(
  supabase: SupabaseClient<Database>,
  booking: Booking,
  contact: Contact | null,
  { cancelled }: { cancelled: boolean },
) {
  const settings = await getSettings(supabase);
  const to = settings?.notification_email?.trim();

  if (!to) {
    console.log(
      `[booking] no operator alert for booking ${booking.id}: no notification email set in Settings`,
    );
    return;
  }

  const base = appBaseUrl();
  const verb = cancelled ? "cancelled their" : "booked a";

  const lines = [
    `${booking.client_name} ${verb} ${MEETING_NAME}.`,
    "",
    `When:  ${formatBookingTime(booking)}`,
    `Phone: ${formatPhone(booking.client_phone)}`,
    `Email: ${booking.client_email}`,
  ];

  if (booking.notes) {
    lines.push("", "They wrote:", "", booking.notes);
  }

  if (contact) {
    lines.push(
      "",
      cancelled
        ? "They are still on the pipeline where they were — cancelling does not move them back."
        : "They have been moved to Booked on the pipeline.",
    );
    if (base) lines.push("", `${base}/inbox/${contact.id}`);
  } else {
    // Worth saying out loud: the meeting is real but nothing in the CRM points
    // at it, so it won't show up where you'd go looking.
    lines.push(
      "",
      "No contact record was linked to this booking — check the logs. The meeting itself is fine.",
    );
  }

  const result = await sendEmail({
    to,
    subject: `${cancelled ? "Cancelled" : "New booking"}: ${booking.client_name}, ${formatBookingTime(booking)}`,
    text: lines.join("\n"),
  });

  if (!result.ok) {
    console.error(
      `[booking] could not email the operator alert for booking ${booking.id}: ${result.error}`,
    );
    return;
  }
  console.log(`[booking] operator alert for booking ${booking.id} emailed to ${to}`);
}

/**
 * Confirmation to the client, plus the alert to the operator.
 *
 * Runs off the response path via `after()`, so three network round trips don't
 * sit between the client pressing the button and seeing that it worked.
 */
export async function sendBookingConfirmation(
  supabase: SupabaseClient<Database>,
  booking: Booking,
  contact: Contact | null,
): Promise<void> {
  try {
    const when = formatBookingTime(booking);
    const cancel = cancelUrl(booking);
    const firstName = booking.client_name.trim().split(/\s+/)[0];

    await Promise.all([
      textClient(
        booking,
        joinLines([
          `You're booked for a ${MEETING_NAME} — ${when}.`,
          "",
          cancel ? `Need to cancel? ${cancel}` : "Reply here if you need to change it.",
        ]),
        "confirmation",
      ),
      emailClient(
        booking,
        `Confirmed: ${MEETING_NAME}, ${when}`,
        joinLines([
          `Hi ${firstName},`,
          "",
          `Your ${MEETING_NAME} is confirmed for ${when}. It runs about an hour, and I'll call the number you gave me: ${formatPhone(booking.client_phone)}.`,
          booking.notes ? `\nYou mentioned: ${booking.notes}` : null,
          "",
          cancel
            ? `If something changes you can cancel here:\n${cancel}`
            : "If something changes, just reply to the text you got.",
          "",
          "— VoltaScales",
        ]),
        "confirmation email",
      ),
      notifyOperator(supabase, booking, contact, { cancelled: false }),
    ]);
  } catch (error) {
    // Belt and braces: each sender already swallows its own failures, so
    // reaching here means something unexpected. The booking still stands.
    console.error(
      `[booking] unexpected failure confirming booking ${booking.id}`,
      error,
    );
  }
}

/** Acknowledgement to the client, plus the alert to the operator. */
export async function sendCancellationNotice(
  supabase: SupabaseClient<Database>,
  booking: Booking,
  contact: Contact | null,
): Promise<void> {
  try {
    const when = formatBookingTime(booking);
    const base = appBaseUrl();
    const firstName = booking.client_name.trim().split(/\s+/)[0];

    await Promise.all([
      textClient(
        booking,
        joinLines([
          `Your ${MEETING_NAME} on ${when} is cancelled.`,
          "",
          base ? `Want another time? ${base}/book` : "Reply here to pick another time.",
        ]),
        "cancellation",
      ),
      emailClient(
        booking,
        `Cancelled: ${MEETING_NAME}, ${when}`,
        joinLines([
          `Hi ${firstName},`,
          "",
          `That's cancelled — your ${MEETING_NAME} on ${when} is off the calendar, and you won't get any reminders for it.`,
          "",
          base ? `Whenever you want to rebook:\n${base}/book` : null,
          "",
          "— VoltaScales",
        ]),
        "cancellation email",
      ),
      notifyOperator(supabase, booking, contact, { cancelled: true }),
    ]);
  } catch (error) {
    console.error(
      `[booking] unexpected failure acknowledging cancellation of ${booking.id}`,
      error,
    );
  }
}
