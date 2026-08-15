import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Booking, Contact, Database } from "@/types/database";

/**
 * Cancellation by token.
 *
 * The token is the whole authorisation: whoever holds the link may cancel that
 * one booking and nothing else. That is a deliberately small thing to protect —
 * the holder of the link is the person who was coming — so a random uuid is
 * enough and an HMAC would add ceremony without adding safety.
 */

/** A UUID, so an obviously malformed token never reaches the database. */
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BookingWithContact = Booking & { contact: Contact | null };

/**
 * `isPast` is resolved here rather than in the page that needs it, because
 * "has this happened yet" is a question about the row and the clock, and a
 * component render is not allowed to read the clock — it has to be idempotent.
 */
export type CancellableBooking = BookingWithContact & { isPast: boolean };

/**
 * The booking a cancel link refers to, whatever state it is in.
 *
 * Returns cancelled and past bookings too. The page needs to tell those apart —
 * "already cancelled" and "that link isn't valid" are different sentences, and
 * collapsing them would have someone chasing a link that worked fine.
 */
export async function findBookingByToken(
  supabase: SupabaseClient<Database>,
  token: string,
  now: Date = new Date(),
): Promise<CancellableBooking | null> {
  if (!TOKEN.test(token)) return null;

  const { data, error } = await supabase
    .from("bookings")
    .select("*, contacts (*)")
    .eq("cancel_token", token)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up that booking: ${error.message}`);
  }
  if (!data) return null;

  const { contacts, ...booking } = data;
  return {
    ...booking,
    contact: contacts,
    isPast: Date.parse(booking.end_time) < now.getTime(),
  };
}

export type CancelOutcome =
  | { ok: true; booking: BookingWithContact }
  | { ok: false; error: string };

/**
 * Cancels a booking and frees its slot.
 *
 * Freeing the slot is a consequence of the status change rather than separate
 * work: both the generator and the `bookings_no_overlap` constraint only ever
 * consider confirmed rows, so flipping the status is what makes the time
 * bookable again. Nothing is deleted — the row is the record that this was
 * booked and then wasn't.
 *
 * The update is conditional on the row still being confirmed, so two clicks on
 * the same link (or a link opened twice in two tabs) cancel once. The second
 * finds nothing to update and says so, rather than sending a second "your
 * meeting is cancelled" text.
 */
export async function cancelBookingByToken(
  supabase: SupabaseClient<Database>,
  token: string,
): Promise<CancelOutcome> {
  if (!TOKEN.test(token)) {
    return { ok: false, error: "That cancellation link isn't valid." };
  }

  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("cancel_token", token)
    .eq("status", "confirmed")
    .select("*, contacts (*)")
    .maybeSingle();

  if (error) {
    return { ok: false, error: `Couldn't cancel that booking: ${error.message}` };
  }

  if (!data) {
    // Either the token is wrong or the booking was already cancelled. Both
    // leave the caller with nothing to cancel; the page distinguishes them by
    // looking the booking up separately.
    return { ok: false, error: "That booking is already cancelled." };
  }

  const { contacts, ...booking } = data;
  return { ok: true, booking: { ...booking, contact: contacts } };
}
