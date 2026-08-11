import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { costCentsOf } from "@/lib/usage/pricing";
import type { Database } from "@/types/database";

/**
 * Estimated Anthropic spend, computed from this app's own logged token usage.
 *
 * Not an account balance, and deliberately not presented as one. Anthropic's
 * usage and cost endpoints (`/v1/organizations/usage_report`, `/cost_report`)
 * require an Admin API key — a different credential from the `sk-ant-api03-…`
 * key used for chat, which returns 401 on all of them. Until one exists, the
 * only honest figure available is what we ourselves recorded: every generation
 * writes its `input_tokens`, `output_tokens` and `model` to `ai_drafts`, and
 * this prices those rows against the published list rates.
 *
 * What it therefore cannot see: usage from anything other than this app, and
 * any discount on the account. It is a floor on spend, not a bill.
 */

export type AnthropicEstimate = {
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

export async function estimateAnthropicSpend(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<AnthropicEstimate> {
  const { data, error } = await supabase
    .from("ai_drafts")
    .select("model, input_tokens, output_tokens, created_at");

  if (error) {
    throw new Error(`Failed to load AI usage: ${error.message}`);
  }

  const monthStart = startOfMonth(now).getTime();
  const perModel = new Map<string, { drafts: number; cents: number }>();

  let monthToDateCents = 0;
  let allTimeCents = 0;
  let monthDrafts = 0;
  let monthInputTokens = 0;
  let monthOutputTokens = 0;
  let unpricedDrafts = 0;

  for (const row of data ?? []) {
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

    allTimeCents += cents;

    if (Date.parse(row.created_at) >= monthStart) {
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
    totalDrafts: data?.length ?? 0,
    monthInputTokens,
    monthOutputTokens,
    unpricedDrafts,
    models: [...perModel.entries()]
      .map(([model, entry]) => ({ model, ...entry }))
      .sort((a, b) => b.cents - a.cents),
  };
}
