"use server";

import { revalidatePath } from "next/cache";

import { normalizePhone } from "@/lib/contacts";
import { SETTINGS_ID } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Deliberately loose: enough to catch a typo, not to adjudicate RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SettingsInput = {
  ai_system_prompt: string;
  notification_email: string;
  forward_to_number: string;
};

export async function saveSettings(
  input: SettingsInput,
): Promise<ActionResult<{ forwardToNumber: string | null }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not authenticated" };

  const email = input.notification_email.trim();
  if (email && !EMAIL.test(email)) {
    return { ok: false, error: `"${email}" doesn't look like an email address.` };
  }

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

  const { error } = await supabase
    .from("settings")
    .update({
      ai_system_prompt: input.ai_system_prompt,
      // Empty means "not set", which is null — an empty string would read as a
      // configured value of nothing.
      notification_email: email || null,
      forward_to_number: forwardToNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", SETTINGS_ID);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, value: { forwardToNumber } };
}
