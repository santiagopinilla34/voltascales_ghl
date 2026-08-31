"use server";

import { revalidatePath } from "next/cache";

import { normalizePhone } from "@/lib/phone/normalize";
import { SETTINGS_ID } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type SettingsInput = {
  forward_to_number: string;
  /**
   * The account's alert number, for every automation that texts the business.
   *
   * Despite the column name this is not a booking setting — missed calls and
   * form submissions resolve `to: "business"` through it too. A calendar can
   * override it for its own bookings; see `calendars.notify_number`.
   */
  booking_notify_number: string;
};

export async function saveSettings(
  input: SettingsInput,
): Promise<
  ActionResult<{ forwardToNumber: string | null; bookingNotifyNumber: string | null }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not authenticated" };

  // Stored E.164 so it matches TWILIO_FORWARD_TO_NUMBER and whatever Twilio
  // expects in <Dial>, rather than however it happened to be typed.
  const rawNumber = input.forward_to_number.trim();
  let forwardToNumber: string | null = null;
  if (rawNumber) {
    forwardToNumber = normalizePhone(rawNumber);
    if (!forwardToNumber) {
      return {
        ok: false,
        error:
          "Enter a 10-digit North American number, or an international one with its + country code.",
      };
    }
  }

  // Same normalisation as the forward-to number, and for the same reason: it
  // is dialled by Twilio, which wants E.164, not however it was typed.
  const rawNotifyNumber = input.booking_notify_number.trim();
  let bookingNotifyNumber: string | null = null;
  if (rawNotifyNumber) {
    bookingNotifyNumber = normalizePhone(rawNotifyNumber);
    if (!bookingNotifyNumber) {
      return {
        ok: false,
        error:
          "Booking alerts: enter a 10-digit North American number, or an international one with its + country code.",
      };
    }
  }

  const { error } = await supabase
    .from("settings")
    .update({
      booking_notify_number: bookingNotifyNumber,
      forward_to_number: forwardToNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", SETTINGS_ID);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, value: { forwardToNumber, bookingNotifyNumber } };
}

/*
 * Availability used to live here too — a weekly pattern and a list of blocked
 * dates, both account-wide, plus the minimum notice, meeting link and host
 * name on `saveSettings`.
 *
 * All of it is per calendar now, in `app/(app)/calendar/settings/actions.ts`,
 * next to the screen that edits it. Nothing is left behind as a shim: an
 * action that wrote "the account's calendar" has no meaning once there are
 * several, and a version that guessed which one you meant would guess wrong.
 */
