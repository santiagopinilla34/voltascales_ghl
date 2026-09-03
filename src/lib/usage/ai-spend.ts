import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { aiModelProvider, type AiProvider } from "@/lib/ai/models";
import { costCentsOf } from "@/lib/usage/pricing";
import type { Database } from "@/types/database";

/**
 * Estimated model spend, computed from this app's own logged token usage.
 *
 * Not an account balance, and deliberately not presented as one. Neither
 * provider will hand this app its real numbers with the credential it already
 * holds: Anthropic's usage and cost endpoints want an Admin API key, and
 * OpenAI's `/v1/organization/costs` refuses a project key with `Missing scopes:
 * api.usage.read`. Until either exists, the only honest figure available is what
 * we recorded ourselves — every generation writes its `input_tokens`,
 * `output_tokens` and `model` to `ai_drafts`, and this prices those rows against
 * the published list rates.
 *
 * What it therefore cannot see: usage from anything other than this app, and
 * any discount on the account. It is a floor on spend, not a bill.
 *
 * ## Why this is split by provider
 *
 * It was not, until agents could be pointed at OpenAI. One function summed
 * every row in `ai_drafts` and the Usage page labelled the total "Anthropic",
 * which was true for exactly as long as Anthropic was the only vendor. The
 * moment a bot answered on `gpt-5.6-luna`, that reply's cost would have been
 * added to the Anthropic card — a number that is wrong on both cards at once,
 * and wrong in the direction nobody checks.
 *
 * The provider comes from `aiModelProvider`, the same list the picker and the
 * generator dispatch on, so a model can never be priced under one vendor and
 * billed to the other.
 */

export type AiSpendEstimate = {
  /** Estimated spend this calendar month, in cents. */
  monthToDateCents: number;
  /** Estimated spend across everything logged, in cents. */
  allTimeCents: number;
  monthDrafts: number;
  totalDrafts: number;
  monthInputTokens: number;
  monthOutputTokens: number;
  /**
   * Drafts whose model has no entry in the price table — left out of the
   * totals, and surfaced so an underestimate never passes as a full one.
   */
  unpricedDrafts: number;
  /** Models seen this month, for the breakdown. */
  models: { model: string; drafts: number; cents: number }[];
  /**
   * Spend since a recorded credit balance, in cents, or null when no balance
   * has been recorded.
   *
   * Computed here rather than in the card because it needs the same per-row
   * pass: a draft counts towards it when it was written after the moment the
   * balance was read. On the Anthropic side this figure comes from Anthropic's
   * own report when an Admin key is present; on the OpenAI side this is the
   * only source there is.
   */
  sinceCreditCents: number | null;
};

/** First instant of the current month, in the operator's zone (see lib/format). */
function startOfMonth(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "America/Toronto",
  }).format(now);

  return new Date(`${parts}-01T00:00:00-05:00`);
}

export async function estimateAiSpend(
  supabase: SupabaseClient<Database>,
  {
    provider,
    creditAt = null,
    now = new Date(),
  }: {
    provider: AiProvider;
    /** When the credit balance was recorded, for `sinceCreditCents`. */
    creditAt?: Date | null;
    now?: Date;
  },
): Promise<AiSpendEstimate> {
  const { data, error } = await supabase
    .from("ai_drafts")
    .select("model, input_tokens, output_tokens, created_at");

  if (error) {
    throw new Error(`Failed to load AI usage: ${error.message}`);
  }

  const monthStart = startOfMonth(now).getTime();
  const creditStart = creditAt ? creditAt.getTime() : null;
  const perModel = new Map<string, { drafts: number; cents: number }>();

  let monthToDateCents = 0;
  let allTimeCents = 0;
  let monthDrafts = 0;
  let totalDrafts = 0;
  let monthInputTokens = 0;
  let monthOutputTokens = 0;
  let unpricedDrafts = 0;
  let sinceCreditCents = 0;

  for (const row of data ?? []) {
    // Somebody else's row. Skipped before anything is counted, including
    // `totalDrafts` — a card that said "44 replies" while pricing three of them
    // would be its own small lie.
    if (aiModelProvider(row.model) !== provider) continue;

    totalDrafts += 1;

    const inputTokens = row.input_tokens ?? 0;
    const outputTokens = row.output_tokens ?? 0;

    const cents = costCentsOf({
      model: row.model,
      inputTokens,
      outputTokens,
      at: row.created_at,
    });

    if (cents === null) {
      unpricedDrafts += 1;
      continue;
    }

    const at = Date.parse(row.created_at);

    allTimeCents += cents;

    if (creditStart !== null && at >= creditStart) {
      sinceCreditCents += cents;
    }

    if (at >= monthStart) {
      monthToDateCents += cents;
      monthDrafts += 1;
      monthInputTokens += inputTokens;
      monthOutputTokens += outputTokens;

      const entry = perModel.get(row.model) ?? { drafts: 0, cents: 0 };
      entry.drafts += 1;
      entry.cents += cents;
      perModel.set(row.model, entry);
    }
  }

  return {
    monthToDateCents,
    allTimeCents,
    monthDrafts,
    totalDrafts,
    monthInputTokens,
    monthOutputTokens,
    unpricedDrafts,
    sinceCreditCents: creditStart === null ? null : sinceCreditCents,
    models: [...perModel.entries()]
      .map(([model, entry]) => ({ model, ...entry }))
      .sort((a, b) => b.cents - a.cents),
  };
}
