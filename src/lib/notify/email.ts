import "server-only";

import { notifyFromAddress, resendApiKey } from "@/lib/env";

/**
 * Transactional email, through Resend.
 *
 * Plain `fetch` rather than the `resend` SDK: sending is a single POST to a
 * single endpoint, and owning the request means owning the failure — which
 * matters more than usual here, because every caller is reporting on something
 * that has *already* happened. An alert that throws would turn "a lead is
 * waiting" into "the webhook crashed".
 *
 * So this never throws. It returns what happened and lets the caller decide,
 * and every caller so far decides to log it and carry on.
 */

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Well inside the webhook's 60s `after()` budget, and short enough that a
 * hanging Resend can't eat the whole thing. Nobody is waiting on this email.
 */
const TIMEOUT_MS = 10_000;

export type EmailResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailResult> {
  const apiKey = resendApiKey();

  // Not an error worth shouting about on its own: email is opt-in, and an
  // unconfigured key is indistinguishable from "the operator hasn't set this
  // up". The caller says which of the two it is.
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: notifyFromAddress(),
        to: [to],
        subject,
        text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Covers both the timeout above and any transport failure.
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reach Resend",
    };
  }

  if (!response.ok) {
    // Resend puts a human-readable reason in the body. Worth surfacing
    // verbatim: the most likely failure is the unverified-domain restriction,
    // where the address being rejected is the actual explanation.
    const detail = await response.text().catch(() => "");
    return {
      ok: false,
      error: `Resend returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as { id?: unknown };

  return {
    ok: true,
    id: typeof payload.id === "string" ? payload.id : "(no id returned)",
  };
}
