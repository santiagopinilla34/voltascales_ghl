"use server";

import { revalidatePath } from "next/cache";

import { AI_MODEL_OPTIONS, AI_MODE_OPTIONS } from "@/lib/ai/models";
import { normalizePhone } from "@/lib/contacts";
import { SETTINGS_ID } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import type { AiMode, AiModel } from "@/types/database";

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Deliberately loose: enough to catch a typo, not to adjudicate RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SettingsInput = {
  ai_system_prompt: string;
  ai_mode: string;
  ai_model: string;
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

  // Checked here as well as by the database's CHECK constraints, so an invalid
  // value comes back as a sentence rather than a Postgres constraint name.
  if (!AI_MODE_OPTIONS.some((option) => option.value === input.ai_mode)) {
    return { ok: false, error: `"${input.ai_mode}" is not a valid AI mode` };
  }
  if (!AI_MODEL_OPTIONS.some((option) => option.value === input.ai_model)) {
    return { ok: false, error: `"${input.ai_model}" is not a valid model` };
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
      ai_mode: input.ai_mode as AiMode,
      ai_model: input.ai_model as AiModel,
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
