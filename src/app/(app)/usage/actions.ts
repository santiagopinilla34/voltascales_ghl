"use server";

import { revalidatePath } from "next/cache";

import { SETTINGS_ID } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Saves the two warning thresholds.
 *
 * `anthropicBudgetCents` is null when the field is cleared, which is the "no
 * budget" state rather than a budget of zero — with no ceiling there is no
 * percentage, and the dashboard shows the estimate without a warning.
 */
export async function saveUsageThresholds(input: {
  twilioLowBalanceCents: number;
  anthropicBudgetCents: number | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not authenticated" };

  if (
    !Number.isInteger(input.twilioLowBalanceCents) ||
    input.twilioLowBalanceCents < 0
  ) {
    return { ok: false, error: "The Twilio floor must be zero or more." };
  }

  if (
    input.anthropicBudgetCents !== null &&
    (!Number.isInteger(input.anthropicBudgetCents) ||
      input.anthropicBudgetCents <= 0)
  ) {
    return { ok: false, error: "The Anthropic budget must be more than zero." };
  }

  const { error } = await supabase
    .from("settings")
    .update({
      twilio_low_balance_cents: input.twilioLowBalanceCents,
      anthropic_monthly_budget_cents: input.anthropicBudgetCents,
    })
    .eq("id", SETTINGS_ID);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/usage");
  return { ok: true };
}
