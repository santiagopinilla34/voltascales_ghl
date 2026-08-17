import "server-only";

import twilio from "twilio";

import { appBaseUrl, serverEnv } from "@/lib/env";
import { resolveTwilioOrigin } from "@/lib/orgs/routing";

export type TwilioParams = Record<string, string>;

/**
 * Rebuilds the absolute URL Twilio signed.
 *
 * Twilio computes the signature over the exact URL it requested. Behind ngrok
 * or Vercel, `request.url` is the internal origin (often http://localhost:3000),
 * so signing against it always fails. Prefer an explicit APP_BASE_URL, then the
 * proxy's forwarded headers, then the raw request as a last resort.
 */
export function publicUrlFor(request: Request): string {
  const requestUrl = new URL(request.url);
  const configured = appBaseUrl();

  if (configured) {
    return `${configured}${requestUrl.pathname}${requestUrl.search}`;
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}${requestUrl.pathname}${requestUrl.search}`;
  }

  return requestUrl.toString();
}

/**
 * Absolute URL for a sibling webhook, built the same way Twilio will sign it.
 *
 * Every TwiML callback URL has to survive `verifyTwilioRequest` on the way back
 * in, which reconstructs the URL with `publicUrlFor`. Deriving both from the
 * same function is what keeps them in agreement behind ngrok and Vercel.
 */
export function webhookUrl(request: Request, pathname: string): string {
  const url = new URL(publicUrlFor(request));
  url.pathname = pathname;
  url.search = "";
  return url.toString();
}

export type VerifiedWebhook =
  | {
      ok: true;
      params: TwilioParams;
      url: string;
      /** Which organization this request belongs to. Never null on success. */
      orgId: string;
      /** True when it arrived on a client's subaccount rather than the parent. */
      isSubaccount: boolean;
    }
  | { ok: false; status: number; reason: string };

/**
 * Reads a Twilio webhook body, works out whose account it is, and verifies the
 * signature with that account's token.
 *
 * These routes are excluded from the auth proxy — the signature *is* the
 * authentication, so an unverified request must never reach the database.
 *
 * The order matters and is the whole reason this function grew. Twilio signs a
 * subaccount's webhooks with the *subaccount's* auth token, not the parent's,
 * so the token cannot be chosen until the body has been parsed and `AccountSid`
 * read. Verifying against the parent token unconditionally — which is what this
 * did before — means every request from every client subaccount fails with a
 * 403, and the symptom is not "multi-tenancy is misconfigured" but "texts to
 * this client silently stop arriving".
 *
 * Parsing before verifying is safe: nothing is trusted until `validateRequest`
 * returns, and the SID is used only to pick which key to check against. A
 * forged SID selects a token that then fails to match the signature.
 */
export async function verifyTwilioRequest(
  request: Request,
): Promise<VerifiedWebhook> {
  const signature = request.headers.get("x-twilio-signature");

  if (!signature) {
    return { ok: false, status: 401, reason: "Missing X-Twilio-Signature" };
  }

  let params: TwilioParams;
  try {
    const formData = await request.formData();
    params = Object.fromEntries(
      Array.from(formData.entries()).map(([key, value]) => [
        key,
        typeof value === "string" ? value : "",
      ]),
    );
  } catch {
    return { ok: false, status: 400, reason: "Body is not form-encoded" };
  }

  const origin = await resolveTwilioOrigin(params.AccountSid);

  if (!origin) {
    // Better a 503 Twilio will retry than a row filed under a guess.
    return {
      ok: false,
      status: 503,
      reason: `Could not resolve an organization for AccountSid ${params.AccountSid ?? "(absent)"}`,
    };
  }

  const url = publicUrlFor(request);
  const valid = twilio.validateRequest(
    origin.authToken ?? serverEnv.twilioAuthToken,
    signature,
    url,
    params,
  );

  if (!valid) {
    return {
      ok: false,
      status: 403,
      reason: `Signature did not match for ${url}`,
    };
  }

  return { ok: true, params, url, orgId: origin.orgId, isSubaccount: origin.isSubaccount };
}

/** TwiML responses must be served as XML or Twilio rejects them. */
export function twimlResponse(xml: string) {
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
