"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { cancelBookingByToken } from "@/lib/booking/cancel";
import { createBooking, type BookingInput } from "@/lib/booking/create";
import {
  sendBookingConfirmation,
  sendCancellationNotice,
} from "@/lib/notify/booking";
import { createAdminClient } from "@/lib/supabase/admin";

export type BookResult =
  | { ok: true; booking: { start: string; end: string; name: string } }
  /** `slotTaken` tells the widget to reload the week rather than just complain. */
  | { ok: false; error: string; slotTaken: boolean };

/**
 * The one public write in the app.
 *
 * No session check, deliberately — this is what an unauthenticated visitor is
 * meant to be able to do. That makes every guard `createBooking` performs load
 * bearing rather than defensive: the slot is re-derived server-side, the phone
 * is normalised, and one number can only hold a few meetings.
 *
 * Uses the service-role client for the same reason the webhooks do: `anon` has
 * no policy on any of these tables, and the alternative — opening RLS to
 * anonymous inserts — would make the whole schema writable from a browser.
 *
 * The return value is narrow on purpose. It carries back what the confirmation
 * screen needs and nothing else; ids, tokens and contact records stay on the
 * server, where a booking page has no business handing them to whoever asked.
 */
export async function book(input: BookingInput): Promise<BookResult> {
  const supabase = createAdminClient();
  const result = await createBooking(supabase, input);

  if (!result.ok) {
    return { ok: false, error: result.error, slotTaken: result.slotTaken ?? false };
  }

  // The slot the next visitor sees must no longer include this one.
  revalidatePath("/book");

  // Off the response path: two SMS/email round trips and an operator alert
  // would otherwise sit between the button press and the confirmation screen,
  // and none of them can change the answer — the meeting is already booked.
  after(() => sendBookingConfirmation(supabase, result.booking, result.contact));

  return {
    ok: true,
    booking: {
      start: result.booking.start_time,
      end: result.booking.end_time,
      name: result.booking.client_name,
    },
  };
}

export type CancelResult = { ok: true } | { ok: false; error: string };

/**
 * Cancels a booking from its emailed link.
 *
 * Public, like `book`, and authorised the same way: by holding the token. It is
 * a Server Action rather than a GET route on purpose — email clients, link
 * scanners and chat previews all follow URLs, and a cancellation that happened
 * because someone's mail provider fetched the link would be a meeting silently
 * lost. Confirming with a button means only a person cancels.
 */
export async function cancelBooking(token: string): Promise<CancelResult> {
  const supabase = createAdminClient();
  const result = await cancelBookingByToken(supabase, token);

  if (!result.ok) return { ok: false, error: result.error };

  // The freed slot has to reappear on the calendar.
  revalidatePath("/book");
  revalidatePath(`/book/cancel/${token}`);

  after(() =>
    sendCancellationNotice(supabase, result.booking, result.booking.contact),
  );

  return { ok: true };
}
