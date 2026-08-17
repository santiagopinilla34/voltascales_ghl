/**
 * What the agency charges a client. Client-safe — the billing page shows these.
 *
 * These are prices, not costs. `MONTHLY_CENTS` in `src/lib/phone/numbers.ts` is
 * what Twilio charges for a number and belongs to the buy screen; what is here
 * is what the client pays, and the difference between the two is the agency's
 * margin. Keeping them in separate files is deliberate — the day someone
 * "tidies up" by pointing one at the other, the business stops making money on
 * every number it sells.
 *
 * PLACEHOLDERS. Every value below is a guess at a sensible retail price and is
 * meant to be replaced. Set them before letting a client top up, because the
 * ledger entries written under the old numbers are history and are not
 * retroactively repriced.
 *
 * Cents throughout, integer, no floats anywhere near money. A tenth of a cent
 * per text is a real price in this market and is not expressible here; if that
 * is needed, the honest fix is to move the whole ledger to tenths of a cent
 * rather than to start rounding at the edges.
 */

export const RATES = {
  /** Per outbound SMS segment. Twilio splits long messages; each part bills. */
  smsOutbound: 2,
  /** Per inbound SMS segment. Receiving is cheaper but is not free. */
  smsInbound: 1,
  /** Per minute of outbound voice, rounded up to the next whole minute. */
  voiceOutboundPerMinute: 4,
  /** Per minute of inbound voice, rounded up. */
  voiceInboundPerMinute: 2,
  /** Per number, per month. Charged on purchase and on each monthly anniversary. */
  numberMonthly: 200,
  /**
   * Per AI reply sent.
   *
   * Per reply rather than per thousand tokens, which is what the plan said.
   * Changed on the way in: "1 AI reply — $0.03" is a line a client can check
   * against their own inbox, and a token count is not. The agency's real
   * Anthropic spend is still visible to the agency on Usage.
   */
  aiReply: 3,
} as const;

/** The smallest top-up. Below this the card fees eat the transaction. */
export const MINIMUM_TOPUP_CENTS = 1000;

/** Offered on the billing page. Custom amounts are allowed above the minimum. */
export const TOPUP_PRESETS_CENTS = [1000, 2500, 5000, 10000] as const;

/**
 * Whole minutes, rounded up, which is how voice is billed everywhere.
 *
 * A 3-second call costs a minute. That is the industry convention rather than
 * an overcharge, and billing the true 0.05 minutes would cost the agency more
 * than it collected — Twilio rounds up to the agency too.
 */
export function billableMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/** "$12.34", and "-$1.20" for an account in arrears. */
export function formatCredit(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
