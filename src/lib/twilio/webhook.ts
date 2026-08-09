import "server-only";

import twilio from "twilio";

import { appBaseUrl, serverEnv } from "@/lib/env";

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

export type VerifiedWebhook =
  | { ok: true; params: TwilioParams; url: string }
  | { ok: false; status: number; reason: string };

/**
 * Reads a Twilio webhook body and verifies its X-Twilio-Signature header.
 *
 * These routes are excluded from the auth proxy — the signature *is* the
 * authentication, so an unverified request must never reach the database.
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

  const url = publicUrlFor(request);
  const valid = twilio.validateRequest(
    serverEnv.twilioAuthToken,
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

  return { ok: true, params, url };
}

/** TwiML responses must be served as XML or Twilio rejects them. */
export function twimlResponse(xml: string) {
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
