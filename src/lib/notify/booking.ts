import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cancellationEmail,
  cancellationSms,
  confirmationEmail,
  confirmationSms,
  formatBookingDate,
  formatBookingTime,
  signature,
  type MessageInput,
} from "@/lib/booking/messages";
import { MEETING_NAME } from "@/lib/booking/slots";
import { appBaseUrl } from "@/lib/env";
import { formatPhone } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { sendSms } from "@/lib/twilio/client";
import type { Booking, Contact, Database, Settings } from "@/types/database";

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

export { formatBookingTime } from "@/lib/booking/messages";

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

/**
 * Everything the client-facing message builders need, gathered once.
 *
 * Assembled here rather than inside the builders so those stay pure and can be
 * called from the browser for the Settings preview, where there is no booking
 * row and no environment to read.
 */
function clientMessageInput(
  booking: Booking,
  settings: Settings | null,
): MessageInput {
  return {
    firstName: booking.client_name.trim().split(/\s+/)[0],
    when: formatBookingTime(booking),
    date: formatBookingDate(booking),
    cancel: cancelUrl(booking),
    join: settings?.booking_meeting_link?.trim() || null,
    base: appBaseUrl(),
    phone: booking.client_phone,
    businessName: settings?.business_name ?? null,
    signOff: settings ? signature(settings) : "- VoltaScales",
  };
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
 * Texts the operator that a booking came in.
 *
 * Separate from the email because it answers a different question. Email is the
 * record — notes, pipeline state, a link to the thread. This is the alert: a
 * booking can land an hour before the meeting, and a message read the next
 * morning would arrive after it.
 *
 * Kept to roughly one SMS segment. Every booking already sends a client
 * confirmation, so this is the second message on your Twilio bill per booking,
 * and a chatty version would quietly make it the third.
 */
async function textOperator(
  to: string,
  booking: Booking,
  { cancelled }: { cancelled: boolean },
) {
  const body = cancelled
    ? `Cancelled: ${booking.client_name} - ${formatBookingTime(booking)}. ${formatPhone(booking.client_phone)}`
    : `New booking: ${booking.client_name} - ${formatBookingTime(booking)}. ${formatPhone(booking.client_phone)}`;

  try {
    await sendSms(to, body);
    console.log(`[booking] operator alert for booking ${booking.id} texted to ${to}`);
  } catch (error) {
    console.error(
      `[booking] could not text the operator alert for booking ${booking.id} to ${to}`,
      error,
    );
  }
}

/**
 * Tells the operator a booking came in, by whichever channels are configured.
 *
 * Reuses the `notify_me` pattern: an unset destination means that channel is
 * off rather than broken, and nothing here can fail the booking. The email
 * includes the pipeline and inbox context that the client-facing messages
 * deliberately don't carry.
 *
 * The email goes to `business_email` from My Business, which is the single
 * destination for every operator alert in the app. Note the asymmetry with the
 * two channels: the alert number still lives in Settings, because a phone
 * number for booking alerts is genuinely a behaviour setting rather than a
 * fact about the business.
 */
async function notifyOperator(
  supabase: SupabaseClient<Database>,
  booking: Booking,
  contact: Contact | null,
  { cancelled }: { cancelled: boolean },
) {
  const settings = await getSettings(supabase);
  const to = settings?.business_email?.trim();
  const smsTo = settings?.booking_notify_number?.trim();

  // Fired first and not awaited alongside the email's assembly: it is the
  // time-sensitive half, and it should not queue behind building a body it
  // shares nothing with.
  const texting = smsTo
    ? textOperator(smsTo, booking, { cancelled })
    : Promise.resolve();

  if (!to) {
    if (!smsTo) {
      console.log(
        `[booking] no operator alert for booking ${booking.id}: no business email is set in My Business and no booking alert number is set in Settings`,
      );
    }
    await texting;
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

  if (result.ok) {
    console.log(`[booking] operator alert for booking ${booking.id} emailed to ${to}`);
  } else {
    console.error(
      `[booking] could not email the operator alert for booking ${booking.id}: ${result.error}`,
    );
  }

  // Awaited on every path, including the failed-email one. Returning early
  // here would drop the text: `after()` stops running once the promise it was
  // handed resolves, and this one is not attached to that chain.
  await texting;
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
    // Read fresh rather than snapshotted onto the booking: changing the meeting
    // link in Settings is meant to fix every future message, including for
    // meetings booked before the change.
    const settings = await getSettings(supabase);
    const message = clientMessageInput(booking, settings);
    const email = confirmationEmail(message);

    await Promise.all([
      textClient(booking, confirmationSms(message), "confirmation"),
      emailClient(booking, email.subject, email.text, "confirmation email"),
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
    const settings = await getSettings(supabase);
    const message = clientMessageInput(booking, settings);
    const email = cancellationEmail(message);

    await Promise.all([
      textClient(booking, cancellationSms(message), "cancellation"),
      emailClient(booking, email.subject, email.text, "cancellation email"),
      notifyOperator(supabase, booking, contact, { cancelled: true }),
    ]);
  } catch (error) {
    console.error(
      `[booking] unexpected failure acknowledging cancellation of ${booking.id}`,
      error,
    );
  }
}
