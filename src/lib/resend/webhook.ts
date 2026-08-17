import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifying that a webhook really came from Resend.
 *
 * Resend signs through Svix, and the `svix` npm package would do this in one
 * call. It is not used here for the same reason `resend` isn't: this is one
 * HMAC over a documented string, and owning it means the failure modes are
 * visible in this file rather than behind a dependency. The algorithm below is
 * Svix's published manual-verification procedure, followed exactly.
 *
 * Getting this wrong has one consequence: anybody who finds the URL can post
 * fabricated bounce events and drive whatever automations are attached to
 * them. So the endpoint fails closed everywhere — unset secret, missing
 * headers, stale timestamp, bad signature — and never falls through to "well,
 * it's probably fine".
 */

/**
 * How far out of date a request may be.
 *
 * Svix documents the need for a tolerance without naming one; five minutes is
 * the value its own libraries use. It exists to stop a replay: an attacker who
 * captures one valid signed request could otherwise post it forever, and the
 * signature would keep verifying because the body never changed.
 */
const TOLERANCE_SECONDS = 5 * 60;

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Constant-time equality over two base64 signatures.
 *
 * `timingSafeEqual` throws when the lengths differ, which is itself a length
 * oracle — but the length of an HMAC-SHA256 digest is fixed, so a differing
 * length means malformed input rather than a near-miss guess, and rejecting it
 * early leaks nothing about the real signature.
 */
function signaturesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "base64");
  const b = Buffer.from(provided, "base64");

  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function verifyResendWebhook({
  payload,
  secret,
  id,
  timestamp,
  signature,
  now = Date.now(),
}: {
  /** The raw request body. Re-serialising parsed JSON changes the bytes. */
  payload: string;
  /** The signing secret, `whsec_…`. */
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  now?: number;
}): VerifyResult {
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "missing svix-id, svix-timestamp or svix-signature" };
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) {
    return { ok: false, reason: "svix-timestamp is not a number" };
  }

  const driftSeconds = Math.abs(now / 1000 - sentAt);
  if (driftSeconds > TOLERANCE_SECONDS) {
    return {
      ok: false,
      reason: `svix-timestamp is ${Math.round(driftSeconds)}s out, over the ${TOLERANCE_SECONDS}s tolerance`,
    };
  }

  // The secret is base64 *after* the prefix. Signing with the prefixed string
  // is the classic way to get this wrong and produce a verifier that rejects
  // every genuine request.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) {
    return { ok: false, reason: "the signing secret is not valid base64" };
  }

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");

  // Space-delimited `version,signature` pairs, and there may be several —
  // during a secret rotation Svix sends one per active key, so any single
  // match is a pass.
  const provided = signature
    .split(" ")
    .filter((entry) => entry.startsWith("v1,"))
    .map((entry) => entry.slice("v1,".length));

  if (provided.length === 0) {
    return { ok: false, reason: "no v1 signature in svix-signature" };
  }

  const matched = provided.some((candidate) =>
    signaturesMatch(expected, candidate),
  );

  return matched ? { ok: true } : { ok: false, reason: "signature did not match" };
}

/**
 * The signing secret for the Resend webhook endpoint.
 *
 * Null rather than throwing when unset: the route reports it as a 503 with an
 * explanation, the way the form webhook and the cron endpoint already do. An
 * endpoint that cannot verify what it receives must refuse to serve rather
 * than process anything.
 */
export function resendWebhookSecret(): string | null {
  const value = process.env.RESEND_WEBHOOK_SECRET?.trim();
  return value ? value : null;
}
