import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Linking a client's own Stripe account, without ever asking them for a key.
 *
 * ## The whole point
 *
 * The obvious way to read a client's payments is to ask them for a restricted
 * API key. In practice that request ends onboarding calls — it sends a
 * non-technical business owner into a developer dashboard to mint a credential
 * they do not understand, and the first thing they do is either paste the wrong
 * one or give up. It is also the worst option security-wise: whatever they
 * paste ends up stored here, scoped however they happened to scope it, valid
 * until somebody remembers to rotate it.
 *
 * Stripe's OAuth flow removes the request entirely. The client clicks a button,
 * lands on Stripe already knowing how to sign in, picks the account they
 * already have, and approves. What comes back to us is an account id — not a
 * credential — and every later request is made with *our* platform key plus a
 * `Stripe-Account` header naming that id. Nothing secret to theirs ever exists
 * on our side, and they revoke us from their own Stripe settings rather than by
 * asking us to delete something.
 *
 * ## Scope: what we want, and what Stripe allows
 *
 * `read_only` is what a dashboard needs, and it is what this should end up
 * asking for. It also avoids a restriction that is otherwise invisible until a
 * client hits it: since June 2021 Stripe refuses a `read_write` connection to
 * an account already controlled by another platform, so a client whose Stripe
 * sits under Shopify or Squarespace cannot connect at all.
 *
 * It is not what we ask for today. Stripe refused `read_only` outright on 20
 * Aug 2026 — *"Please use the `read_write` scope, or contact support … in order
 * to use read-only connections"* — so it is gated per platform despite the docs
 * calling it the default. `connectScope()` therefore defaults to `read_write`
 * and flips back via one environment variable once Stripe enables it.
 *
 * Two consequences worth holding on to while that is true. Clients on
 * platform-controlled accounts will fail to connect, and the reason will not be
 * obvious from the error. And the connect screen must describe the scope it
 * actually holds — see `connect-gate.tsx` — because promising "this app cannot
 * move money" while holding `read_write` is a lie told to somebody deciding
 * whether to trust us with their revenue.
 *
 * ## On Stripe's deprecation notices
 *
 * Stripe's docs say OAuth "isn't recommended for new Connect platforms" and
 * that the Standard/Express/Custom account types are deprecated. That guidance
 * addresses marketplaces that route payments between parties, which this is
 * not. This is the extension case — an app reading an account the user already
 * owns and controls — which Stripe carves out explicitly: extensions "won't
 * experience any changes to how OAuth behaves". Worth knowing, not worth
 * avoiding.
 *
 * ## Unconfigured fails loudly
 *
 * Until the platform credentials exist there is no pretend mode here, and that
 * is on purpose. `checkout.ts` can simulate a top-up because the number it
 * invents is our own ledger. A simulated *payments dashboard* would be a screen
 * of invented revenue belonging to somebody else, which is not a preview of
 * anything — it is a screen that could be believed. So an unconfigured install
 * shows the connect gate and says it is unavailable; it never shows numbers.
 */

const AUTHORIZE_URL = "https://connect.stripe.com/oauth/authorize";
const TOKEN_URL = "https://connect.stripe.com/oauth/token";
const DEAUTHORIZE_URL = "https://connect.stripe.com/oauth/deauthorize";

export type ConnectScope = "read_only" | "read_write";

/**
 * The scope we ask Stripe for.
 *
 * **`read_only` is not available to every platform.** Stripe's docs call it the
 * default, and it is not: this platform was refused with *"Please use the
 * `read_write` scope, or contact support … in order to use read-only
 * connections"* (20 Aug 2026). It has to be enabled per platform by Stripe
 * support, so the default here is the scope that actually works, and the
 * intended end state is a support request away.
 *
 * Set `STRIPE_CONNECT_SCOPE=read_only` the day Stripe approves it. Every
 * already-connected client has to reconnect when this changes, so it is cheap
 * now and expensive later.
 *
 * Nothing user-facing hardcodes this. The connect screen's promises are
 * derived from it — see `connect-gate.tsx` — because a screen that says "this
 * app cannot move money" while holding `read_write` is a false security claim,
 * which is worse than an ugly one.
 */
export function connectScope(): ConnectScope {
  return process.env.STRIPE_CONNECT_SCOPE?.trim() === "read_only"
    ? "read_only"
    : "read_write";
}

/** Name of the cookie holding the signed CSRF state between the two hops. */
export const STATE_COOKIE = "stripe_connect_state";

/** Short: this is one redirect to Stripe and back, not a session. */
export const STATE_MAX_AGE_SECONDS = 10 * 60;

export type StripePlatformConfig = {
  clientId: string;
  secretKey: string;
  baseUrl: string;
};

/**
 * The platform credentials, or null when the integration is not set up.
 *
 * All three or nothing. A half-configured install — a client id with no secret
 * key — would send the client all the way to Stripe, get them to approve, and
 * then fail on the exchange, which is the most confusing place to fail.
 */
export function stripePlatformConfig(): StripePlatformConfig | null {
  const clientId = process.env.STRIPE_CLIENT_ID?.trim();
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const baseUrl = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");

  if (!clientId || !secretKey || !baseUrl) return null;

  return { clientId, secretKey, baseUrl };
}

export function isStripeConfigured(): boolean {
  return stripePlatformConfig() !== null;
}

/**
 * Where Stripe sends the client back to.
 *
 * Derived from the request rather than from `APP_BASE_URL`, because that
 * variable holds the *production* origin — it is what Twilio's webhooks are
 * pointed at, so it cannot be flipped to localhost without breaking the phone
 * system. Taking the origin from the request means the same build works on
 * localhost, on a preview deployment and in production.
 *
 * That this is attacker-influenceable through the Host header does not matter:
 * Stripe refuses any `redirect_uri` not on the platform's registered list, so
 * the allowlist doing the work lives at Stripe. The consequence to remember is
 * the practical one — **every origin you want to use must be registered there**,
 * localhost included, or the flow dies after the client has already approved.
 *
 * `APP_BASE_URL` remains the fallback for any caller with no request in hand.
 */
export function redirectUri(config: StripePlatformConfig, requestUrl?: string): string {
  const origin = requestUrl ? new URL(requestUrl).origin : config.baseUrl;
  return `${origin}/api/payments/stripe/callback`;
}

// ---------------------------------------------------------------------------
// CSRF state
// ---------------------------------------------------------------------------
//
// The `state` parameter comes back from Stripe untouched, so it is the only
// thing tying the callback to the browser that started it. Without it, anyone
// could hand a signed-in user a crafted callback URL and attach *their* Stripe
// account to that user's organization.
//
// It is signed rather than stored. A row in the database would work too, but it
// needs cleaning up and adds a table whose only job is to survive one redirect.
// An HMAC over the org id plus a nonce needs neither, and binding the org into
// the signature means a state minted while working inside one account cannot be
// replayed against another.

function stateSecret(): string {
  // Falls back to the platform secret key, which is already required for any of
  // this to work and is never sent anywhere. A separate secret would be tidier;
  // an *absent* one would silently disable the check, which is worse.
  return (
    process.env.STRIPE_CONNECT_STATE_SECRET?.trim() ||
    process.env.STRIPE_SECRET_KEY?.trim() ||
    ""
  );
}

function sign(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("hex");
}

/** A state token bound to the organization the connection is being made for. */
export function createState(orgId: string): string {
  const payload = `${orgId}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * True when `candidate` is a state we minted for this organization.
 *
 * Compares the cookie and the query parameter as well as the signature, so a
 * valid-but-different token cannot be swapped in.
 */
export function verifyState(candidate: string, cookie: string, orgId: string): boolean {
  if (!candidate || !cookie) return false;
  if (!safeEqual(candidate, cookie)) return false;

  const parts = candidate.split(".");
  if (parts.length !== 3) return false;

  const [statedOrg, nonce, signature] = parts;
  if (statedOrg !== orgId) return false;

  return safeEqual(signature, sign(`${statedOrg}.${nonce}`));
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch rather than returning false.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// ---------------------------------------------------------------------------
// The two hops
// ---------------------------------------------------------------------------

/** Where to send the client to approve the connection. */
export function authorizeUrl(
  config: StripePlatformConfig,
  state: string,
  requestUrl?: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    scope: connectScope(),
    redirect_uri: redirectUri(config, requestUrl),
    state,
  });

  // Nothing is prefilled deliberately. Stripe's `stripe_user[…]` parameters can
  // seed the signup half of the flow, but every one of them is a guess about a
  // business we only know the name of, and a wrong country on that screen is
  // one the client has to notice and correct. The common case here is a client
  // who already has Stripe and only picks it from a list anyway.

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type ExchangeResult =
  | { ok: true; accountId: string; scope: string; livemode: boolean }
  | { ok: false; error: string };

/**
 * Trades the one-time authorization code for the client's account id.
 *
 * The code is short-lived and single-use, so a failure here is terminal for
 * this attempt — the client has to start again rather than retry.
 */
export async function exchangeCode(
  config: StripePlatformConfig,
  code: string,
): Promise<ExchangeResult> {
  let response: Response;

  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ code, grant_type: "authorization_code" }),
    });
  } catch (error) {
    console.error("[payments] token exchange failed to send", error);
    return { ok: false, error: "Could not reach Stripe. Try connecting again." };
  }

  const body = (await response.json().catch(() => null)) as
    | {
        stripe_user_id?: string;
        scope?: string;
        livemode?: boolean;
        error_description?: string;
        error?: string;
      }
    | null;

  if (!response.ok || !body?.stripe_user_id) {
    // Stripe's own description is the useful half; it names the actual problem
    // ("Authorization code does not exist") where our wrapper could only guess.
    const detail = body?.error_description ?? body?.error ?? `HTTP ${response.status}`;
    console.error("[payments] token exchange rejected", detail);
    return { ok: false, error: "Stripe did not complete the connection." };
  }

  return {
    ok: true,
    accountId: body.stripe_user_id,
    scope: body.scope === "read_write" ? "read_write" : "read_only",
    livemode: body.livemode !== false,
  };
}

/**
 * Tells Stripe to drop the connection.
 *
 * Called before the row is deleted. If this fails the row stays, because a
 * deleted row with a live authorization at Stripe is the one state that cannot
 * be recovered from inside this app — the client would have to find and revoke
 * it in their own Stripe settings, having been told by us that it was already
 * gone.
 */
export async function deauthorize(
  config: StripePlatformConfig,
  accountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(DEAUTHORIZE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        stripe_user_id: accountId,
      }),
    });

    if (response.ok) return { ok: true };

    const body = (await response.json().catch(() => null)) as
      | { error_description?: string; error?: string }
      | null;

    // Already disconnected at Stripe's end — by the client, from their own
    // dashboard — is a success from here. The goal state is reached.
    if (body?.error === "invalid_client" || response.status === 404) {
      return { ok: true };
    }

    console.error("[payments] deauthorize rejected", body?.error_description ?? response.status);
    return { ok: false, error: "Stripe would not release the connection." };
  } catch (error) {
    console.error("[payments] deauthorize failed to send", error);
    return { ok: false, error: "Could not reach Stripe. Try again." };
  }
}
