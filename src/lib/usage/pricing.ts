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
  const formatter =
    dollars !== 0 && Math.abs(dollars) < 0.01 ? USD_PRECISE : USD;
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
  // OpenAI's budget tier. Same caveat as everything above — hand-copied from
  // the public price list, no pricing endpoint exists, and the figures here are
  // what make every number in the UI an estimate rather than a bill.
  "gpt-5.6-luna": {
    label: "GPT-5.6 Luna",
    input: 0.2,
    output: 1.2,
  },
  "gpt-5.4-mini": {
    label: "GPT-5.4 mini",
    input: 0.75,
    output: 4.5,
  },
  "gpt-5.4-nano": {
    label: "GPT-5.4 nano",
    input: 0.2,
    output: 1.25,
  },
  "gpt-5-mini": {
    label: "GPT-5 mini",
    input: 0.25,
    output: 2,
  },
  "gpt-5-nano": {
    label: "GPT-5 nano",
    input: 0.05,
    output: 0.4,
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

/**
 * The multipliers caching applies to the input rate.
 *
 * Anthropic prices cached input off the same per-model rate rather than
 * publishing separate numbers, so these live here as ratios and stay correct
 * when a model's input price changes.
 */
const CACHE_RATES = {
  /** A hit, and the reason caching is worth having. */
  read: 0.1,
  /** Writing the five-minute entry. */
  write5m: 1.25,
  /** The hour-long entry keeps the prefix around longer and costs more to put there. */
  write1h: 2,
} as const;

export type CachedTokenUse = TokenUse & {
  cacheReadTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
};

/**
 * Cost of a block of usage that involved the prompt cache, in cents.
 *
 * Separate from `costCentsOf` rather than folded into it because the two have
 * different inputs: a stored draft knows only its input and output totals,
 * while Anthropic's usage report splits input four ways. Pricing cached tokens
 * at the uncached rate overstates a cache hit by ten times, which is the whole
 * saving reported as spend.
 */
export function cachedCostCentsOf(use: CachedTokenUse): number | null {
  const price = MODEL_PRICES[use.model];
  if (!price) return null;

  const promo = price.introductory;
  const rate =
    promo && Date.parse(use.at) < Date.parse(promo.endsBefore) ? promo : price;

  const dollars =
    (use.inputTokens / 1_000_000) * rate.input +
    (use.cacheReadTokens / 1_000_000) * rate.input * CACHE_RATES.read +
    (use.cacheWrite5mTokens / 1_000_000) * rate.input * CACHE_RATES.write5m +
    (use.cacheWrite1hTokens / 1_000_000) * rate.input * CACHE_RATES.write1h +
    (use.outputTokens / 1_000_000) * rate.output;

  return dollars * 100;
}
