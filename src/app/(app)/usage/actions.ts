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
  openaiBudgetCents: number | null;
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

  // Both budgets take the same rule, and both are checked here rather than
  // trusted from the form: these are Server Actions, so the numbers arrive from
  // the browser and a zero would mean "warn always".
  for (const [label, cents] of [
    ["Anthropic", input.anthropicBudgetCents],
    ["OpenAI", input.openaiBudgetCents],
  ] as const) {
    if (cents !== null && (!Number.isInteger(cents) || cents <= 0)) {
      return { ok: false, error: `The ${label} budget must be more than zero.` };
    }
  }

  const { error } = await supabase
    .from("settings")
    .update({
      twilio_low_balance_cents: input.twilioLowBalanceCents,
      anthropic_monthly_budget_cents: input.anthropicBudgetCents,
      openai_monthly_budget_cents: input.openaiBudgetCents,
    })
    .eq("id", SETTINGS_ID);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/usage");
  return { ok: true };
}

/**
 * Records the Anthropic credit balance as read off the Console.
 *
 * Anthropic publishes no balance endpoint, so this is the one figure on the
 * Usage page a person has to supply. The timestamp is taken here rather than
 * accepted from the caller: it is what the remaining figure is computed from,
 * and "when you pressed save" is the only moment the number was known to be
 * true.
 *
 * Null clears it, which puts the card back to showing spend with no remaining
 * figure — the state every account starts in.
 */
export async function saveAnthropicCredit(
  cents: number | null,
): Promise<ActionResult> {
  return saveCredit("anthropic", cents);
}

/**
 * The same, for OpenAI.
 *
 * A separate exported action rather than one taking a provider string, because
 * these are Server Actions: the argument arrives from the browser, and a
 * provider name that decides which column gets written is one more thing to
 * validate. Two entry points, each naming its own columns, cannot be pointed at
 * the wrong ones.
 */
export async function saveOpenAiCredit(
  cents: number | null,
): Promise<ActionResult> {
  return saveCredit("openai", cents);
}

async function saveCredit(
  provider: "anthropic" | "openai",
  cents: number | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not authenticated" };

  if (cents !== null && (!Number.isInteger(cents) || cents < 0)) {
    return { ok: false, error: "The balance must be zero or more." };
  }

  const at = cents === null ? null : new Date().toISOString();

  const { error } = await supabase
    .from("settings")
    .update(
      provider === "anthropic"
        ? { anthropic_credit_cents: cents, anthropic_credit_at: at }
        : { openai_credit_cents: cents, openai_credit_at: at },
    )
    .eq("id", SETTINGS_ID);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/usage");
  return { ok: true };
}
