import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifying that a webhook really came from Stripe.
 *
 * This endpoint deletes payment connections, so an unverified one is a URL
 * where anyone can disconnect any client's Stripe by guessing an account id.
 * Fails closed, like the Resend and form webhooks.
 *
 * Stripe's scheme, for reference, since this is hand-rolled rather than
 * `stripe.webhooks.constructEvent`:
 *
 *   Stripe-Signature: t=1492774577,v1=<hex>,v1=<hex>
 *
 * The signed payload is `${t}.${raw body}`, HMAC-SHA256 with the endpoint's
 * signing secret. More than one `v1` can appear while a secret is being rolled,
 * so any match counts.
 */

/** How far out of date a signature may be. Stripe's own default. */
const TOLERANCE_SECONDS = 300;

export function stripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyStripeWebhook({
  payload,
  secret,
  signature,
  now = Date.now(),
}: {
  /** The raw request body, byte for byte. */
  payload: string;
  secret: string;
  signature: string | null;
  /** Injectable so the tolerance window is testable. */
  now?: number;
}): VerifyResult {
  if (!signature) return { ok: false, reason: "no Stripe-Signature header" };

  let timestamp: string | null = null;
  const candidates: string[] = [];

  for (const part of signature.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t") timestamp = value ?? null;
    if (key === "v1" && value) candidates.push(value);
  }

  if (!timestamp) return { ok: false, reason: "no timestamp in signature" };
  if (candidates.length === 0) return { ok: false, reason: "no v1 signature" };

  // The timestamp is inside the signed payload, so this cannot be forged — but
  // it can be *replayed*, which is what the window is for. Without it a
  // captured request stays valid forever.
  const age = Math.abs(Math.floor(now / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    return { ok: false, reason: `timestamp outside tolerance (${age}s)` };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const matched = candidates.some((candidate) => safeEqual(candidate, expected));

  return matched ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch rather than returning false.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
