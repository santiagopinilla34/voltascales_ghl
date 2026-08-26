import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * How much of the month's crawling budget has actually been spent, read from
 * Firecrawl rather than inferred from what this database happens to still
 * hold.
 *
 * ## Why not just count the rows
 *
 * The picker used to say "6 of 1,000 pages stored", counting
 * `knowledge_web_pages`. That number answers "how full is the base", which is
 * not the question somebody about to tick forty checkboxes is asking. Crawl
 * fifty pages, decide forty-four were junk, delete them: the row count says 6
 * and the fifty pages were still fetched and still paid for. The budget it was
 * standing in for had moved and the number had not.
 *
 * Firecrawl's own ledger does not have that problem — spending is spending,
 * and deleting a row afterwards does not un-spend it.
 *
 * ## One crawled page is one credit
 *
 * Measured, not assumed: a `/v2/scrape` with this app's exact parameters
 * (`formats: ["markdown", "links"]`, `onlyMainContent: false`, no stealth
 * proxy) moved `remainingCredits` by exactly one, and moved the historical
 * ledger's current bucket by exactly one. So credits and pages are the same
 * unit here and the conversion is the identity — which is worth stating as a
 * constant anyway, because the day this app asks Firecrawl for JSON extraction
 * or a stealth fetch that stops being true, and this is the line that has to
 * change.
 *
 * ## Why it is an estimate
 *
 * `extract.ts` fetches every page directly first and only pays Firecrawl for
 * one thin enough to look like a JavaScript shell. A page that answers with
 * real HTML is read for free and never appears in this number. So the count
 * is a floor on pages crawled, not a census — which is the honest direction to
 * be wrong in for a budget gauge, since the pages it misses are the ones that
 * cost nothing.
 *
 * ## Where "used" comes from
 *
 * The historical endpoint, not `planCredits - remainingCredits`. That
 * subtraction is broken on any account that has ever been topped up: this one
 * reads 1,000 plan against 1,102 remaining, so the subtraction says *minus a
 * hundred and one* pages crawled. Top-ups and promotional credits sit on top
 * of the allowance and there is no field that separates them out, so the only
 * trustworthy "spent" figure is the one Firecrawl reports directly.
 *
 * That ledger lags the live balance by up to about a minute — a scrape shows
 * in `remainingCredits` at once and in the bucket shortly after. Fine for a
 * gauge that is read when a dialog opens.
 *
 * ## Failure is silence, never an error
 *
 * Every path returns null: no key, a non-200, an unexpected body, a timeout.
 * The caller falls back to the stored-row count. This decorates a screen whose
 * actual job is choosing pages, and a picker that refuses to open because a
 * third party's status endpoint is down would be a worse product.
 */

const CREDIT_USAGE_ENDPOINT = "https://api.firecrawl.dev/v2/team/credit-usage";

const HISTORICAL_ENDPOINT =
  "https://api.firecrawl.dev/v2/team/credit-usage/historical";

/**
 * Credits one crawled page costs.
 *
 * See the measurement above. If the crawler ever asks Firecrawl for something
 * dearer than a plain scrape, this is the number that moves.
 */
export const CREDITS_PER_CRAWL = 1;

/** Long enough that a picker opened twice does not ask twice; short enough to move within a crawl. */
const CACHE_SECONDS = 300;

/** These are decoration on this screen, so they get a short leash. */
const TIMEOUT_MS = 5_000;

export type FirecrawlUsage = {
  /** Pages crawled this period, at `CREDITS_PER_CRAWL` each. The picker's numerator. */
  pagesCrawled: number;
  /**
   * Pages the plan covers per period, at the same rate. The picker's
   * denominator.
   *
   * From the API rather than from `ORG_PAGE_LIMIT`, so an upgraded plan shows
   * its real ceiling instead of the constant that happens to match today's.
   */
  pagesAllowed: number;
  /**
   * When `pagesCrawled` goes back to nought, as an ISO stamp at UTC midnight.
   *
   * The start of the next calendar month, *not* `billingPeriodEnd` — and the
   * difference is not pedantry. Firecrawl reports usage in strict calendar
   * buckets (this account's open one runs from 1 August) while the plan renews
   * on the subscription anniversary (24 September). Labelling this counter
   * with the anniversary would promise a number holding until the 24th when it
   * will visibly drop to zero on the 1st.
   *
   * The honest label is the one that matches the number beside it, so this is
   * derived from the bucket the count came out of. It does mean the numerator
   * and denominator run on different clocks — see `resetsOn` in the picker's
   * tooltip, which says so out loud.
   */
  resetsOn: string | null;
};

export async function readFirecrawlUsage(): Promise<FirecrawlUsage | null> {
  const apiKey = serverEnv.firecrawlApiKey;
  if (!apiKey) return null;

  const headers = { authorization: `Bearer ${apiKey}` };

  try {
    // The allowance and the ledger are two endpoints and neither needs the
    // other's answer.
    const [planned, spent] = await Promise.all([
      readPlanCredits(headers),
      readCreditsUsed(headers),
    ]);

    if (planned === null || spent === null) return null;

    return {
      pagesCrawled: Math.round(spent.used / CREDITS_PER_CRAWL),
      pagesAllowed: Math.round(planned / CREDITS_PER_CRAWL),
      resetsOn: nextBucketStart(spent.since),
    };
  } catch {
    return null;
  }
}

/** The monthly allowance. */
async function readPlanCredits(
  headers: Record<string, string>,
): Promise<number | null> {
  const data = await getJson(CREDIT_USAGE_ENDPOINT, headers);
  const plan = (data as { data?: { planCredits?: unknown } })?.data
    ?.planCredits;
  return typeof plan === "number" ? plan : null;
}

/**
 * Credits spent in the period still running.
 *
 * The open bucket is the one with no `endDate`; Firecrawl returns the list
 * oldest-first and closes each period as it rolls over. Falling back to the
 * last entry would report a finished month as though it were this one, so a
 * list with nothing open reports nothing.
 */
async function readCreditsUsed(
  headers: Record<string, string>,
): Promise<{ used: number; since: string | null } | null> {
  const body = await getJson(HISTORICAL_ENDPOINT, headers);
  const periods = (body as { periods?: unknown })?.periods;
  if (!Array.isArray(periods)) return null;

  const open = periods.find(
    (period: unknown) =>
      typeof period === "object" &&
      period !== null &&
      (period as { endDate?: unknown }).endDate == null,
  ) as { creditsUsed?: unknown; startDate?: unknown } | undefined;

  if (typeof open?.creditsUsed !== "number") return null;

  return {
    used: open.creditsUsed,
    since: typeof open.startDate === "string" ? open.startDate : null,
  };
}

/**
 * The first instant of the month after the one a bucket opened in.
 *
 * Firecrawl gives the open bucket a start and no end, so the end has to be
 * worked out. `Date.UTC` with a month of 12 rolls into January of the next
 * year on its own, which is the whole reason for doing the arithmetic in UTC
 * parts rather than by adding days.
 *
 * UTC throughout, deliberately: these boundaries are UTC midnights, and
 * shifting one into a local zone turns "1 September" into "31 August, 8 p.m."
 * — a reset date a day earlier than the truth.
 */
function nextBucketStart(since: string | null): string | null {
  if (!since) return null;

  const opened = new Date(since);
  if (Number.isNaN(opened.getTime())) return null;

  return new Date(
    Date.UTC(opened.getUTCFullYear(), opened.getUTCMonth() + 1, 1),
  ).toISOString();
}

async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: CACHE_SECONDS },
  });

  if (!response.ok) return null;
  return response.json();
}
