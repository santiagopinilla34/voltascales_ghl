"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { cancelBookingById } from "@/lib/booking/cancel";
import { sendCancellationNotice } from "@/lib/notify/booking";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Cancels a meeting from the dashboard.
 *
 * The client is told, by the same texts and emails their own cancel link would
 * have sent. Cancelling silently would leave someone waiting by the phone for a
 * call that isn't coming, which is the one outcome this whole feature exists to
 * avoid — so the notice is not optional and not a checkbox.
 */
export async function cancelBookingAsOperator(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not authenticated" };

  const result = await cancelBookingById(supabase, id);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/calendar");
  // The freed slot has to reappear on the public calendar.
  revalidatePath("/book");

  after(() =>
    sendCancellationNotice(supabase, result.booking, result.booking.contact),
  );

  return { ok: true };
}
