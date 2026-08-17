import "server-only";

import { resendApiKey } from "@/lib/env";

/**
 * Send activity for a domain: what was delivered, what bounced.
 *
 * There are two ways to get this out of Resend and neither is ideal, so this
 * module tries the good one and falls back to the available one.
 *
 * **`GET /emails/metrics`** takes a `domain_id` and returns exactly these
 * counts, aggregated server-side over a date range. It is also in private beta
 * and limited to a few accounts — this one returns 404 for it today. It is
 * still tried first, because the day access is granted the numbers get better
 * on their own, and because a 404 is cheap.
 *
 * **`GET /emails`** is generally available and returns each email's `from` and
 * `last_event`. Filtering on the domain and counting the events gives real
 * numbers over a bounded window. That window is the honest catch: it is the
 * most recent N emails *account-wide*, not all time, and the UI has to say so
 * rather than presenting a partial count as a total.
 *
 * Nothing here is invented. When neither route works, the card says the data
 * is unavailable instead of showing zeros — a zero and an unknown look
 * identical on a dashboard and mean opposite things.
 */

const BASE = "https://api.resend.com";
const TIMEOUT_MS = 15_000;

/**
 * How many recent emails to scan when deriving.
 *
 * Three pages at Resend's maximum of 100. Enough to be a meaningful sample of
 * a small business's sending, bounded so the dashboard cannot turn into a
 * crawl of an account's entire history. `truncated` tells the UI when the
 * window was hit so the number can be labelled "at least".
 */
const MAX_PAGES = 3;
const PAGE_SIZE = 100;

export type SendActivity = {
  /** Which route produced these numbers. The UI labels them differently. */
  source: "metrics" | "derived";
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
  /** Sent but not yet resolved — queued, scheduled, or delayed. */
  inFlight: number;
  /** Total attributed to this domain within the window. */
  total: number;
  /** Derived only: the window ran out before the sending history did. */
  truncated: boolean;
  /** ISO timestamp of the oldest send counted, or null when nothing was found. */
  since: string | null;
};

export type ActivityResult =
  | { ok: true; value: SendActivity }
  | { ok: false; error: string };

/**
 * Resend returns Postgres-style timestamps (`2026-08-11 02:34:43.075000+00`),
 * not ISO 8601 with a `T`. V8 happens to parse them, but leaning on one
 * engine's leniency for a value that goes on to be formatted for display is
 * how a date silently becomes "Invalid Date" on some other runtime.
 */
function toIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;

  const normalized = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** The domain of a From header, which may be `Name <box@domain>` or bare. */
function domainOf(from: unknown): string | null {
  if (typeof from !== "string") return null;

  const address = from.includes("<")
    ? from.slice(from.lastIndexOf("<") + 1, from.lastIndexOf(">"))
    : from;
  const at = address.lastIndexOf("@");

  return at === -1 ? null : address.slice(at + 1).trim().toLowerCase();
}

/**
 * Which bucket an email's last event falls into.
 *
 * `last_event` is the *latest* event, not a status, and that distinction is
 * the trap: an email that was delivered and then opened reports `opened`.
 * Counting only the literal `delivered` would undercount deliveries by however
 * many were read. Opens and clicks are therefore counted as deliveries, which
 * they necessarily are.
 */
function bucketOf(
  event: unknown,
): "delivered" | "bounced" | "complained" | "failed" | "inFlight" | null {
  switch (event) {
    case "delivered":
    case "opened":
    case "clicked":
      return "delivered";
    case "bounced":
      return "bounced";
    case "complained":
      return "complained";
    case "failed":
    case "suppressed":
      return "failed";
    case "sent":
    case "scheduled":
    case "delivery_delayed":
      return "inFlight";
    default:
      return null;
  }
}

async function get(path: string): Promise<Response | null> {
  const apiKey = resendApiKey();
  if (!apiKey) return null;

  try {
    return await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

/** The private-beta route. Returns null whenever it is not available. */
async function fromMetrics(domainId: string): Promise<SendActivity | null> {
  const response = await get(
    `/emails/metrics?domain_id=${encodeURIComponent(domainId)}` +
      `&metrics=sent,delivered,bounced,complained,failed`,
  );

  if (!response || !response.ok) return null;

  const body = (await response.json().catch(() => null)) as {
    totals?: Record<string, unknown>;
    start_date?: unknown;
  } | null;

  const totals = body?.totals;
  if (!totals) return null;

  const count = (key: string) =>
    typeof totals[key] === "number" ? (totals[key] as number) : 0;

  const delivered = count("delivered");
  const bounced = count("bounced");
  const complained = count("complained");
  const failed = count("failed");
  const sent = count("sent");

  return {
    source: "metrics",
    delivered,
    bounced,
    complained,
    failed,
    // Whatever has been sent but has not resolved into one of the above.
    inFlight: Math.max(0, sent - delivered - bounced - complained - failed),
    total: sent,
    truncated: false,
    since: toIso(body?.start_date),
  };
}

/** The generally-available route: scan recent sends and count them. */
async function fromEmailList(domainName: string): Promise<ActivityResult> {
  const wanted = domainName.trim().toLowerCase();

  const counts = {
    delivered: 0,
    bounced: 0,
    complained: 0,
    failed: 0,
    inFlight: 0,
  };
  let total = 0;
  let since: string | null = null;
  let truncated = false;
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = cursor
      ? `?limit=${PAGE_SIZE}&after=${encodeURIComponent(cursor)}`
      : `?limit=${PAGE_SIZE}`;
    const response = await get(`/emails${query}`);

    if (!response) {
      return { ok: false, error: "Couldn't reach Resend for send activity." };
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      return {
        ok: false,
        error:
          typeof body?.message === "string"
            ? body.message
            : `Resend returned ${response.status} for send activity.`,
      };
    }

    const body = (await response.json().catch(() => null)) as {
      data?: unknown;
      has_more?: unknown;
    } | null;
    const list = Array.isArray(body?.data) ? body.data : [];

    for (const entry of list as Record<string, unknown>[]) {
      if (domainOf(entry.from) !== wanted) continue;

      total += 1;

      const bucket = bucketOf(entry.last_event);
      if (bucket) counts[bucket] += 1;

      // The list comes back newest first, so the last match seen in the last
      // page scanned is the oldest.
      const at = toIso(entry.created_at);
      if (at && (since === null || at < since)) since = at;
    }

    const hasMore = body?.has_more === true;
    const last = list[list.length - 1] as { id?: unknown } | undefined;

    if (!hasMore || list.length === 0 || typeof last?.id !== "string") {
      truncated = false;
      break;
    }

    cursor = last.id;
    // Ran out of pages before running out of history.
    truncated = page === MAX_PAGES - 1;
  }

  return {
    ok: true,
    value: { source: "derived", ...counts, total, truncated, since },
  };
}

/**
 * Send activity for one domain.
 *
 * `domainId` is only used by the metrics route; the fallback can only match on
 * the name, because `GET /emails` does not report which domain an email
 * belongs to — only the From address it was sent with.
 */
export async function getSendActivity(input: {
  domainId: string;
  domainName: string;
}): Promise<ActivityResult> {
  const metrics = await fromMetrics(input.domainId);
  if (metrics) return { ok: true, value: metrics };

  return fromEmailList(input.domainName);
}
