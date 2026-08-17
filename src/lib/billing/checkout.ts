import "server-only";

import { MINIMUM_TOPUP_CENTS } from "./rates";

/**
 * Where a top-up goes to be paid for.
 *
 * There is no Stripe account yet, so there is no Stripe here. What there is
 * instead is the shape of one: a function that takes an amount and hands back
 * a URL to send the customer to, and a confirmation that credits the ledger
 * when the payment comes back. Those are the only two points Stripe touches,
 * so wiring it later is this file and a webhook route — not the ledger, not
 * the guards, not the billing page.
 *
 * ## The simulated mode is real money in the app
 *
 * It credits the same ledger the real one will, which means a simulated top-up
 * buys real texts on the agency's real Twilio account. That is the point — it
 * is the only way to exercise the whole path before Stripe exists — but it also
 * means the screen must never be mistakable for a payment. It carries no card
 * fields and says what it is, twice.
 *
 * Switching to `stripe` before the integration is written fails loudly rather
 * than silently falling back to crediting without payment, which is the one
 * outcome worth being paranoid about here.
 */

export type BillingMode = "simulated" | "stripe";

export function billingMode(): BillingMode {
  return process.env.BILLING_MODE?.trim() === "stripe" ? "stripe" : "simulated";
}

export type CheckoutStart =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Validates an amount and returns where to send the customer to pay it.
 *
 * The amount is re-checked here as well as in the form, because the form is a
 * suggestion and this is a server action reachable by anyone signed in.
 */
export function startCheckout(input: {
  orgId: string;
  cents: number;
}): CheckoutStart {
  if (!Number.isInteger(input.cents)) {
    return { ok: false, error: "That is not a valid amount." };
  }

  if (input.cents < MINIMUM_TOPUP_CENTS) {
    return {
      ok: false,
      error: `The smallest top-up is $${(MINIMUM_TOPUP_CENTS / 100).toFixed(2)}.`,
    };
  }

  // A ceiling, because a typo in a custom amount should not be a five-figure
  // charge. Round numbers above this are a conversation, not a form field.
  if (input.cents > 100_000) {
    return {
      ok: false,
      error: "Top-ups over $1,000 need to go through your agency directly.",
    };
  }

  if (billingMode() === "stripe") {
    // Deliberately not a fallback to the simulated path. Reaching here means
    // someone set BILLING_MODE=stripe expecting cards to be charged, and
    // quietly crediting the account for free would be the worst possible way
    // to discover the integration is missing.
    return {
      ok: false,
      error:
        "BILLING_MODE is set to stripe, but the Stripe integration is not wired up yet. Unset it to use the simulated flow.",
    };
  }

  return { ok: true, url: `/billing/checkout?amount=${input.cents}` };
}
