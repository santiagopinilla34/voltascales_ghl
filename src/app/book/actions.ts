"use server";

import { revalidatePath } from "next/cache";

import { createBooking, type BookingInput } from "@/lib/booking/create";
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

  return {
    ok: true,
    booking: {
      start: result.booking.start_time,
      end: result.booking.end_time,
      name: result.booking.client_name,
    },
  };
}
