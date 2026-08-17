import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runAutomationsForEvent } from "@/lib/automations/engine";
import { bookingVariables } from "@/lib/booking/variables";
import { appBaseUrl } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import type { Booking, Contact, Database } from "@/types/database";

/**
 * Everything that goes out when a booking is made or cancelled.
 *
 * Four messages fire on a booking — a text and an email to the client, a text
 * and an email to you — and until now all four were written here, in code.
 * They are automations now: `booking_confirmed_client`,
 * `booking_confirmed_operator` and their cancellation counterparts, seeded
 * with exactly the text this file used to build. Editing a word is a visit to
 * the Automations page rather than a deploy, and the page finally admits that
 * four messages go out every time somebody books.
 *
 * What is left here is the part a template cannot do for itself: gathering the
 * booking, the contact, the settings and the app's own origin into the
 * variables the rules substitute, and deciding where a `to: "contact"` message
 * is actually addressed.
 *
 * Same posture as before: none of this throws. The meeting is already on the
 * calendar by the time any of it runs, and a failed confirmation text must not
 * turn a booking that worked into an error the client sees. The engine logs
 * each rule's outcome to `automation_runs`, which the run log renders — so a
 * message that failed is now visible in the UI rather than only in a server
 * log nobody is watching.
 */

export { formatBookingTime } from "@/lib/booking/messages";

/**
 * The client's cancel link, or null when the app doesn't know its own origin.
 *
 * A dead link in a confirmation is worse than no link — someone who can't
 * cancel will simply not turn up — so an unset APP_BASE_URL drops the line
 * entirely and the message says to reply instead.
 *
 * Still exported: the booking pages build the same link for their own use.
 */
export function cancelUrl(booking: Pick<Booking, "cancel_token">): string | null {
  const base = appBaseUrl();
  return base ? `${base}/book/cancel/${booking.cancel_token}` : null;
}

/**
 * Fires the rules for one booking event.
 *
 * The recipient is taken from the booking rather than the contact, and that is
 * deliberate: someone can book with a different number or address than the
 * contact record holds, and for a message about this meeting the booking form
 * is where they said to reach them.
 */
async function runBookingRules(
  supabase: SupabaseClient<Database>,
  booking: Booking,
  contact: Contact | null,
  { cancelled }: { cancelled: boolean },
): Promise<void> {
  // Read fresh rather than snapshotted onto the booking: changing the meeting
  // link or your sign-off is meant to fix every future message, including for
  // meetings booked before the change.
  const settings = await getSettings(supabase, booking.org_id);

  const outcomes = await runAutomationsForEvent(supabase, {
    orgId: booking.org_id,
    trigger: cancelled ? "booking_cancelled" : "booking_confirmed",
    contact,
    recipient: { phone: booking.client_phone, email: booking.client_email },
    variables: bookingVariables({
      booking,
      contact,
      settings,
      baseUrl: appBaseUrl(),
      cancelled,
    }),
  });

  // Worth a line of its own. Every other "nothing happened" here is a rule
  // deciding not to run, which the run log explains; this one means there is
  // no rule at all, and a client who just booked is getting silence.
  if (outcomes.length === 0) {
    console.error(
      `[booking] no active ${cancelled ? "booking_cancelled" : "booking_confirmed"} rules — ` +
        `booking ${booking.id} produced no messages at all`,
    );
    return;
  }

  for (const outcome of outcomes) {
    const line = `[booking] "${outcome.automationName}" ${outcome.status}: ${outcome.detail}`;
    if (outcome.status === "failed") console.error(line);
    else console.log(line);
  }
}

/**
 * Confirmation to the client, plus the alert to the operator.
 *
 * Runs off the response path via `after()`, so the network round trips don't
 * sit between the client pressing the button and seeing that it worked.
 */
export async function sendBookingConfirmation(
  supabase: SupabaseClient<Database>,
  booking: Booking,
  contact: Contact | null,
): Promise<void> {
  try {
    await runBookingRules(supabase, booking, contact, { cancelled: false });
  } catch (error) {
    // Belt and braces: the engine already swallows a rule's own failures, so
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
    await runBookingRules(supabase, booking, contact, { cancelled: true });
  } catch (error) {
    console.error(
      `[booking] unexpected failure acknowledging cancellation of ${booking.id}`,
      error,
    );
  }
}
