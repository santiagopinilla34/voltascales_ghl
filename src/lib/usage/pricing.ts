/**
 * Published Anthropic list prices, in USD per million tokens.
 *
 * Hand-maintained: there is no pricing endpoint on the API, so this is a copy
 * of the public price list and it goes stale when Anthropic changes it. That is
 * the whole reason every figure derived from it is labelled an estimate in the
 * UI rather than presented as a bill.
 *
 * Client-safe (no `server-only`): the usage page formats these in the browser.
 */

/**
 * Money on this page is USD, not the CAD the invoice helpers assume — both
 * providers bill in US dollars. Rendered with an explicit `US$` so it can never
 * be mistaken for the CAD figures elsewhere in the app.
 */
const USD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
});

/** Sub-cent amounts are real for a single AI reply; show them rather than $0.00. */
const USD_PRECISE = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatUsdCents(cents: number): string {
  const dollars = cents / 100;
  const formatter = dollars !== 0 && Math.abs(dollars) < 0.01 ? USD_PRECISE : USD;
  return `US${formatter.format(dollars)}`;
}

export type ModelPrice = {
  label: string;
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
  /**
   * Promotional rate, while one is running. Priced per draft by its own
   * timestamp rather than by today's date, so a month that straddles the end of
   * an introductory period is costed correctly on both sides of it.
   */
  introductory?: { input: number; output: number; endsBefore: string };
};

/** Keyed by the exact `ai_drafts.model` string. */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-sonnet-5": {
    label: "Claude Sonnet 5",
    input: 3,
    output: 15,
    introductory: { input: 2, output: 10, endsBefore: "2026-09-01T00:00:00Z" },
  },
  "claude-opus-4-8": {
    label: "Claude Opus 4.8",
    input: 5,
    output: 25,
  },
  "claude-haiku-4-5-20251001": {
    label: "Claude Haiku 4.5",
    input: 1,
    output: 5,
  },
};

export type TokenUse = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** ISO timestamp, used to pick the rate that applied at the time. */
  at: string;
};

/**
 * Cost of one generation, in cents.
 *
 * Returns null for a model with no price on file rather than guessing. An
 * unknown model has to stay visibly unpriced — silently costing it at a
 * neighbour's rate would make the total look complete when it isn't.
 */
export function costCentsOf(use: TokenUse): number | null {
  const price = MODEL_PRICES[use.model];
  if (!price) return null;

  const promo = price.introductory;
  const rate =
    promo && Date.parse(use.at) < Date.parse(promo.endsBefore) ? promo : price;

  const dollars =
    (use.inputTokens / 1_000_000) * rate.input +
    (use.outputTokens / 1_000_000) * rate.output;

  // Fractions of a cent are real here — a single short reply costs well under
  // one — so keep them and round only at the end of a sum.
  return dollars * 100;
}
