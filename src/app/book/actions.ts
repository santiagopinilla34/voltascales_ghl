"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { cancelBookingByToken } from "@/lib/booking/cancel";
import { createBooking, type BookingInput } from "@/lib/booking/create";
import {
  attachBookingToLink,
  claimOneTimeLink,
  releaseOneTimeLink,
} from "@/lib/booking/one-time-links";
import { resolveBookingCalendar } from "@/lib/booking/resolve";
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
  // Resolved rather than trusted. The id arrives from a browser, and looking it
  // up here is what stops a posted id naming an inactive calendar, another
  // organization's calendar, or one that was deleted since the page rendered.
  const resolved = await resolveBookingCalendar({ id: input.calendarId });

  if (!resolved) {
    return {
      ok: false,
      slotTaken: false,
      error: "That booking link is no longer valid. Ask for a current one.",
    };
  }

  // Claimed *before* the booking, and handed back below if the booking fails.
  //
  // The other order would let two people on the same link both book: each
  // would check "is it used" before either wrote, and both would pass. This
  // way exactly one of them gets the row back.
  const claimed = input.oneTimeToken
    ? await claimOneTimeLink(resolved.supabase, input.oneTimeToken)
    : null;

  if (input.oneTimeToken && !claimed) {
    return {
      ok: false,
      slotTaken: false,
      error:
        "This link has already been used to book. Ask for a new one if you need to change the time.",
    };
  }

  // Belt and braces on top of the page render: a claimed link that names a
  // different calendar than the one being booked is a request nobody built.
  if (claimed && claimed.calendar_id !== resolved.calendar.id) {
    await releaseOneTimeLink(resolved.supabase, claimed.id);
    return {
      ok: false,
      slotTaken: false,
      error: "That link is for a different calendar. Ask for a current one.",
    };
  }

  const result = await createBooking(resolved.supabase, resolved.calendar, input);

  if (!result.ok) {
    // A mistyped phone number must not burn the link and leave someone with a
    // dead URL for a meeting they never got.
    if (claimed) await releaseOneTimeLink(resolved.supabase, claimed.id);
    return { ok: false, error: result.error, slotTaken: result.slotTaken ?? false };
  }

  if (claimed) {
    await attachBookingToLink(resolved.supabase, claimed.id, result.booking.id);
  }

  // The slot the next visitor sees must no longer include this one — on every
  // route that can render this calendar.
  revalidatePath("/book", "layout");

  // Off the response path: two SMS/email round trips and an operator alert
  // would otherwise sit between the button press and the confirmation screen,
  // and none of them can change the answer — the meeting is already booked.
  after(() =>
    sendBookingConfirmation(resolved.supabase, result.booking, result.contact),
  );

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
  revalidatePath("/book", "layout");
  revalidatePath(`/book/cancel/${token}`);

  after(() =>
    sendCancellationNotice(supabase, result.booking, result.booking.contact),
  );

  return { ok: true };
}
