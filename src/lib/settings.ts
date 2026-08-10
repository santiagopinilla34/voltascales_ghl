import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Settings } from "@/types/database";

/** The one row's primary key. See `settings_singleton` in the migration. */
export const SETTINGS_ID = true;

/**
 * Reads the settings row.
 *
 * Returns null only if the row is genuinely missing — the migration seeds it,
 * so that means the migration hasn't been applied. Callers surface that rather
 * than silently substituting defaults, because a blank AI system prompt looks
 * like a configuration choice and isn't one.
 */
export async function getSettings(
  supabase: SupabaseClient<Database>,
): Promise<Settings | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load settings: ${error.message}`);
  }

  return data;
}

/**
 * The environment's forward-to number.
 *
 * Read straight from `process.env` rather than through `serverEnv`, whose
 * getter throws when unset — both callers treat an unset value as information,
 * not as a crash.
 */
export function environmentForwardToNumber(): string | null {
  return process.env.TWILIO_FORWARD_TO_NUMBER?.trim() || null;
}

/**
 * Where inbound calls should be forwarded: the settings row if it has a number,
 * otherwise `TWILIO_FORWARD_TO_NUMBER`.
 *
 * Never throws, and never lets a database problem decide that a call goes
 * nowhere. This runs on the critical path of a ringing phone — if the settings
 * read fails for any reason we fall through to the environment, which is what
 * the webhook used before this was configurable. Returns null only when neither
 * source has a number, which is a genuine misconfiguration the caller handles.
 *
 * Read fresh on every call, deliberately: being able to change the number
 * without a redeploy is the entire point of moving it out of the environment,
 * and this is one indexed lookup against a single-row table.
 */
export async function resolveForwardToNumber(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const fallback = environmentForwardToNumber();

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("forward_to_number")
      .eq("id", SETTINGS_ID)
      .maybeSingle();

    if (error) {
      console.error(
        "[settings] forward-to lookup failed, using TWILIO_FORWARD_TO_NUMBER",
        error,
      );
      return fallback;
    }

    const configured = data?.forward_to_number?.trim();
    return configured || fallback;
  } catch (error) {
    console.error(
      "[settings] forward-to lookup threw, using TWILIO_FORWARD_TO_NUMBER",
      error,
    );
    return fallback;
  }
}
