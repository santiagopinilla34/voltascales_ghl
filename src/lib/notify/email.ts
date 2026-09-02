import "server-only";

import { resendApiKey } from "@/lib/env";
import { resolveSendingIdentity } from "@/lib/resend/sending";

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
  orgId,
}: {
  to: string;
  subject: string;
  text: string;
  /**
   * Whose mail this is. Decides the From address, which is the client's own
   * verified domain — sending a client's booking confirmation from the
   * agency's domain is both confusing to the recipient and worse for
   * deliverability, since the domain has no relationship with the business
   * that is supposedly writing.
   */
  orgId?: string;
}): Promise<EmailResult> {
  const apiKey = resendApiKey();

  // Not an error worth shouting about on its own: email is opt-in, and an
  // unconfigured key is indistinguishable from "the operator hasn't set this
  // up". The caller says which of the two it is.
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }

  // Resolved per send rather than read from the environment, so choosing a
  // sending domain on the Email Services page takes effect without a redeploy.
  // Falls back to NOTIFY_FROM_EMAIL and then to Resend's shared sender, which
  // is where this started and the reason client mail was vanishing.
  const { from, replyTo } = await resolveSendingIdentity(orgId);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        // Omitted rather than sent empty when nothing is configured: Resend
        // rejects an empty `reply_to`, and a send that fails over a header
        // nobody set would lose the message this whole module exists to
        // deliver.
        //
        // When it is set, it is doing the load-bearing work. The From domain
        // is a sending subdomain created with `receiving: "disabled"`, so a
        // client hitting Reply without this header is writing to an address
        // that cannot accept mail.
        ...(replyTo.length > 0 ? { reply_to: replyTo } : {}),
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
