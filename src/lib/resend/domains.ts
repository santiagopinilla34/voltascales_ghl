import "server-only";

import { resendApiKey } from "@/lib/env";

import type { ResendDomain, ResendRegion } from "./types";

/**
 * Resend's domain API, as much of it as the Email Services page needs.
 *
 * Plain `fetch` rather than the `resend` SDK, for the same reason
 * `src/lib/notify/email.ts` uses plain fetch: these are five endpoints with
 * small JSON bodies, and owning the request means owning the failure. It also
 * means the failures can be *classified* — see `ResendErrorKind` — which is the
 * whole difference between a page that says "your API key can only send email,
 * create a full-access one" and a page that says "401".
 *
 * Nothing here throws. Every function returns a discriminated result and the
 * caller decides what the operator sees. That is a stronger rule here than in
 * `email.ts`, where the callers are background notifications: these run inside
 * server actions with a human waiting on a button, and an unhandled throw
 * would surface as Next's error overlay rather than as a sentence.
 *
 * ## What this API does and does not give you
 *
 * Confirmed against the live docs, because several things one would expect are
 * absent and the UI has to stop pretending otherwise:
 *
 * - **No verification timestamp.** A domain has `created_at` and `status` and
 *   nothing in between. "Verified on the 14th" has to be recorded by us, when
 *   we first see the status flip — hence `settings.sending_verified_at`.
 * - **No DMARC record.** `records` carries SPF (an MX and a TXT) and DKIM (a
 *   TXT), plus a tracking CNAME if tracking is switched on. DMARC is real and
 *   worth publishing, but Resend documents it rather than issuing it, so
 *   anything we show for it is our own and has to be labelled as such.
 * - **No SSL status.** There is `tls`, which is a *policy you choose*
 *   (`opportunistic` or `enforced`), not a health signal that can be green or
 *   red. And `capabilities.sending`, which is closer to a status.
 * - **No per-domain send counts on the domain object.** Those come from
 *   `/emails/metrics` (private beta) or are derived from `/emails` — a separate
 *   module, deliberately, so this one stays the shape of the API it wraps.
 */

const BASE = "https://api.resend.com";

/**
 * Longer than the 10s in `email.ts`. Every call here is behind a button with a
 * spinner on it, so waiting is visible and legible; a notification nobody is
 * watching is the case that should give up early, not this one.
 */
const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// The API's shapes
// ---------------------------------------------------------------------------
//
// Declared in `./types`, which is client-safe, and re-exported here so server
// code has one import for the whole API.

export type {
  ResendDnsRecord,
  ResendDomain,
  ResendDomainStatus,
  ResendRegion,
} from "./types";

/**
 * The region every domain this app creates is registered in.
 *
 * Not configurable, and that is a decision rather than an omission. A region is
 * chosen once and cannot be changed afterwards — moving a domain to another one
 * means deleting it at Resend, re-adding it, and republishing a fresh set of
 * DNS records including a new DKIM key. Putting that behind a dropdown on a
 * form invites a choice whose cost is invisible at the moment of making it,
 * for a business whose recipients are all in North America.
 */
export const SENDING_REGION: ResendRegion = "us-east-1";

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * Why a call failed, in terms the UI can act on.
 *
 * `restricted_key` is the one that earns this whole union. The key this app
 * ships with is a send-only key, which sends mail perfectly well and returns
 * 401 on every endpoint in this file. Without classifying it, the Email
 * Services page would tell you your credentials are wrong when they are
 * correct and merely too narrow — and the fix (mint a full-access key) is not
 * something anyone guesses from "Unauthorized".
 */
export type ResendErrorKind =
  | "not_configured"
  | "restricted_key"
  | "unauthorized"
  | "not_found"
  | "already_exists"
  | "rate_limited"
  | "network"
  | "unknown";

export type ResendResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: ResendErrorKind; error: string };

/** Whether a Resend key is present at all. Says nothing about its permissions. */
export function resendConfigured(): boolean {
  return resendApiKey() !== null;
}

/**
 * A sentence for each failure kind, written for the operator rather than the
 * log. Kept beside the union so a new kind cannot be added without one.
 */
export function describeResendError(
  kind: ResendErrorKind,
  detail: string,
): string {
  switch (kind) {
    case "not_configured":
      return "No Resend API key is set. Add RESEND_API_KEY to your environment.";
    case "restricted_key":
      return (
        "Your Resend API key can only send email — it can't manage domains. " +
        "In the Resend dashboard, create a new key with Full access and " +
        "replace RESEND_API_KEY with it."
      );
    case "unauthorized":
      return "Resend rejected the API key. Check that RESEND_API_KEY is current.";
    case "not_found":
      return "Resend doesn't have that domain. It may have been deleted there.";
    case "already_exists":
      return (
        "That domain is already registered with Resend — either on this " +
        "account or on another team's. A domain can only be active on one."
      );
    case "rate_limited":
      return "Too many requests to Resend just now. Wait a moment and try again.";
    case "network":
      return `Couldn't reach Resend: ${detail}`;
    default:
      return detail || "Resend returned an error.";
  }
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

type ResendErrorBody = { name?: unknown; message?: unknown };

/**
 * Maps an HTTP status and Resend's error `name` onto a kind.
 *
 * The `name` is checked before the status because it is more specific: a 401
 * alone cannot distinguish a wrong key from a correct but restricted one, and
 * that distinction is the difference between two completely different fixes.
 */
function classify(status: number, body: ResendErrorBody | null): ResendErrorKind {
  const name = typeof body?.name === "string" ? body.name : "";

  if (name === "restricted_api_key") return "restricted_key";
  if (name === "validation_error" && status === 422) return "already_exists";

  switch (status) {
    case 401:
    case 403:
      return "unauthorized";
    case 404:
      return "not_found";
    case 409:
      return "already_exists";
    case 429:
      return "rate_limited";
    default:
      return "unknown";
  }
}

async function request<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<ResendResult<T>> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    return {
      ok: false,
      kind: "not_configured",
      error: describeResendError("not_configured", ""),
    };
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // These are read-through-to-Resend calls behind a button. A cached
      // verification check is a verification check that lies.
      cache: "no-store",
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "the request did not complete";
    return { ok: false, kind: "network", error: describeResendError("network", detail) };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ResendErrorBody | null;
    const kind = classify(response.status, body);
    const message =
      typeof body?.message === "string" && body.message
        ? body.message
        : `Resend returned ${response.status}`;

    // The classified sentence wins for the kinds that have one; `unknown`
    // falls through to whatever Resend said, which is usually specific and
    // always better than a status code on its own.
    return { ok: false, kind, error: describeResendError(kind, message) };
  }

  const value = (await response.json().catch(() => null)) as T | null;
  if (value === null) {
    return {
      ok: false,
      kind: "unknown",
      error: "Resend returned a response that could not be read as JSON.",
    };
  }

  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * Registers a sending domain and gets its DNS records back.
 *
 * The records in the response are the whole point of the call: the DKIM key is
 * generated per domain and exists nowhere until this returns. There is no way
 * to know it in advance, which is why the old preview page could only ship a
 * placeholder.
 *
 * `custom_return_path` is left at Resend's default of `send`, so the SPF MX
 * lands on `send.<domain>`. Worth knowing when picking a domain: on a root
 * domain that MX sits beside any mailbox MX you add later, which is the
 * practical argument for pointing this at a subdomain.
 */
export async function createDomain(input: {
  name: string;
}): Promise<ResendResult<ResendDomain>> {
  return request<ResendDomain>("/domains", {
    method: "POST",
    body: {
      name: input.name,
      region: SENDING_REGION,
      // Explicit rather than defaulted: this app sends and does not receive,
      // and a domain configured to receive would publish inbound MX records
      // that would be confusing to be handed and pointless to publish.
      capabilities: { sending: "enabled", receiving: "disabled" },
    },
  });
}

/** Every domain on the Resend account. The page's source of truth for the list. */
export async function listDomains(): Promise<ResendResult<ResendDomain[]>> {
  const result = await request<{ data?: ResendDomain[] }>("/domains", {
    method: "GET",
  });

  if (!result.ok) return result;
  return { ok: true, value: result.value.data ?? [] };
}

/** One domain, with its current record-by-record verification state. */
export async function getDomain(id: string): Promise<ResendResult<ResendDomain>> {
  return request<ResendDomain>(`/domains/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

/**
 * Asks Resend to re-read DNS for a domain.
 *
 * Asynchronous, and this is the single most misleading thing about the flow.
 * The call returns `{object, id}` immediately and the domain goes to `pending`
 * *whatever it was before* — including if it was already verified. It says
 * nothing about whether the records were found. The answer arrives later, via
 * `getDomain`, which is why every caller here pairs the two and why the UI has
 * to be honest that checking again in a minute is a normal part of this.
 */
export async function verifyDomain(
  id: string,
): Promise<ResendResult<{ id: string }>> {
  return request<{ id: string }>(
    `/domains/${encodeURIComponent(id)}/verify`,
    { method: "POST" },
  );
}

/**
 * Triggers a re-check and reads the result back in one call.
 *
 * The pause between the two is doing real work: `verify` is asynchronous, and
 * reading immediately returns the `pending` that `verify` itself just set,
 * which would make every check look like it reset a verified domain. A second
 * is not enough for DNS propagation and is not meant to be — it is enough for
 * Resend to have finished a lookup it usually completes in well under that,
 * and the UI tells you to check again either way.
 */
export async function verifyAndRead(
  id: string,
): Promise<ResendResult<ResendDomain>> {
  const triggered = await verifyDomain(id);
  if (!triggered.ok) return triggered;

  await new Promise((resolve) => setTimeout(resolve, 1_000));

  return getDomain(id);
}

/** Removes a domain from Resend. Publishing its records again will not undo it. */
export async function deleteDomain(
  id: string,
): Promise<ResendResult<{ id: string; deleted?: boolean }>> {
  return request<{ id: string; deleted?: boolean }>(
    `/domains/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
