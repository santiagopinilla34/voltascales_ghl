import "server-only";

import { serverEnv } from "@/lib/env";
import { cachedCostCentsOf } from "@/lib/usage/pricing";

/**
 * Anthropic's own record of what this account has used, up to the last hour.
 *
 * The companion to `estimateAnthropicSpend`, which prices this app's logged
 * tokens. This reads Anthropic's usage report instead, so it sees every use of
 * the account — the Console playground, Claude Code, anything else holding a
 * key — and it splits input four ways, which is the only way to price a cache
 * hit at the tenth of the rate it actually costs.
 *
 * ## Why not the cost report
 *
 * `/cost_report` returns what was invoiced, discounts included, which sounds
 * strictly better. It lags by about a day: its daily buckets are only produced
 * once a day has closed, so today never appears and the figure on screen
 * silently excludes the replies you just watched go out.
 *
 * The usage report has the same lag on daily buckets but *not* on hourly ones —
 * hours appear as they happen. So the month is assembled from days for the part
 * that has settled and hours for today, and priced here rather than read off an
 * invoice. The cost is list rates: any discount on the account is invisible, so
 * this is what the usage is worth rather than what it was charged. For an
 * account paying list rates they are the same number, and this one is current.
 *
 * Needs an Admin API key — a different, far more powerful credential than the
 * chat key, and only available to a team organization. Absent, everything here
 * returns null and the page falls back to the estimate.
 */

const BASE = "https://api.anthropic.com/v1/organizations/usage_report/messages";

/** The cost report caps daily buckets at 31: one calendar month, no paging. */
const MAX_DAYS = 31;

/** And 168 hourly ones, which is far more than the day this asks for. */
const MAX_HOURS = 24;

/** Same budget as the chat call: this runs while someone waits for a page. */
const TIMEOUT_MS = 10_000;

export type LiveUsage = {
  /** Priced at list rates, in cents, for the calendar month so far. */
  monthToDateCents: number;
  /**
   * Priced the same way, but counted from the instant the credit balance was
   * recorded. Null when no balance has been recorded, or when that moment is
   * further back than the report will reach.
   */
  sinceCreditCents: number | null;
  /** The most recent hour Anthropic had data for, as an ISO timestamp. */
  through: string | null;
  monthInputTokens: number;
  monthOutputTokens: number;
  monthCacheReadTokens: number;
  monthCacheWriteTokens: number;
  /** Usage this app could not price, so a partial total never reads as whole. */
  unpricedModels: string[];
  models: { model: string; cents: number; outputTokens: number }[];
};

type Bucket = {
  starting_at: string;
  results: {
    model: string | null;
    uncached_input_tokens: number;
    cache_read_input_tokens: number;
    cache_creation?: {
      ephemeral_5m_input_tokens?: number;
      ephemeral_1h_input_tokens?: number;
    };
    output_tokens: number;
  }[];
};

async function get(query: string, key: string): Promise<Bucket[] | null> {
  try {
    const response = await fetch(`${BASE}?${query}`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // The page is already `force-dynamic` and has a Refresh button; caching
      // here would make that button a lie.
      cache: "no-store",
    });

    if (!response.ok) {
      // 401 is the ordinary case — a revoked key, or one from a different
      // organization. Logged rather than thrown: the caller falls back to the
      // estimate, and a usage page that 500s over its own figure is worse than
      // one showing a rougher number.
      console.error(
        `[usage] Anthropic usage report returned ${response.status}: ${await response
          .text()
          .catch(() => "")}`.slice(0, 300),
      );
      return null;
    }

    const body = (await response.json()) as { data: Bucket[] };
    return body.data;
  } catch (error) {
    console.error("[usage] Anthropic usage report failed", error);
    return null;
  }
}

function iso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function fetchLiveUsage({
  /**
   * When the recorded credit balance was true. Usage from here is summed
   * separately so the page can subtract it from that balance.
   */
  creditAt,
  now = new Date(),
}: { creditAt?: Date | null; now?: Date } = {}): Promise<LiveUsage | null> {
  const key = serverEnv.anthropicAdminApiKey;
  if (!key) return null;

  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // Floored to its UTC day, because that is the finest the settled part of the
  // window resolves to. It errs towards counting a little too much — usage
  // earlier on the day the balance was recorded is charged against it — which
  // shows slightly less credit remaining than there is. Wrong in the direction
  // that cannot cause a surprise.
  const creditDay =
    creditAt && Number.isFinite(creditAt.getTime())
      ? new Date(
          Date.UTC(
            creditAt.getUTCFullYear(),
            creditAt.getUTCMonth(),
            creditAt.getUTCDate(),
          ),
        )
      : null;

  // The report reaches back 31 daily buckets. A balance recorded before that is
  // not something this can price, so it says so rather than quietly summing a
  // shorter window and calling it the total.
  const earliest = new Date(todayStart.getTime() - (MAX_DAYS - 1) * 86_400_000);
  const creditInReach = creditDay !== null && creditDay >= earliest;

  // One window covering both questions, so this stays two API calls rather than
  // four. Whichever start is earlier bounds the daily call; the two sums are
  // taken from the same buckets afterwards.
  const dailyStart =
    creditInReach && creditDay < monthStart ? creditDay : monthStart;

  // Two calls, because the report aggregates a day only once that day is over.
  // Days carry the settled part of the month; hours carry today. Their windows
  // do not overlap — the daily call stops at midnight this morning — so nothing
  // is counted twice.
  const [days, hours] = await Promise.all([
    dailyStart < todayStart
      ? get(
          `starting_at=${encodeURIComponent(iso(dailyStart))}` +
            `&ending_at=${encodeURIComponent(iso(todayStart))}` +
            `&bucket_width=1d&limit=${MAX_DAYS}&group_by[]=model`,
          key,
        )
      : Promise.resolve([]),
    get(
      `starting_at=${encodeURIComponent(iso(todayStart))}` +
        `&bucket_width=1h&limit=${MAX_HOURS}&group_by[]=model`,
      key,
    ),
  ]);

  // Only the hourly call is essential: on the first of the month it is the
  // whole answer, and on every other day it is the part that makes this live.
  if (!hours) return null;

  const perModel = new Map<string, { cents: number; outputTokens: number }>();
  const unpriced = new Set<string>();

  let monthToDateCents = 0;
  let sinceCreditCents = 0;
  let monthInputTokens = 0;
  let monthOutputTokens = 0;
  let monthCacheReadTokens = 0;
  let monthCacheWriteTokens = 0;
  let through: string | null = null;

  for (const bucket of [...(days ?? []), ...hours]) {
    for (const item of bucket.results) {
      const model = item.model ?? "unknown";
      const write5m = item.cache_creation?.ephemeral_5m_input_tokens ?? 0;
      const write1h = item.cache_creation?.ephemeral_1h_input_tokens ?? 0;

      // Buckets before the month start are only here for the credit window, so
      // the month totals skip them.
      const inMonth = Date.parse(bucket.starting_at) >= monthStart.getTime();
      const sinceCredit =
        creditInReach &&
        Date.parse(bucket.starting_at) >= (creditDay as Date).getTime();

      if (inMonth) {
        monthInputTokens += item.uncached_input_tokens;
        monthOutputTokens += item.output_tokens;
        monthCacheReadTokens += item.cache_read_input_tokens;
        monthCacheWriteTokens += write5m + write1h;
      }

      const cents = cachedCostCentsOf({
        model,
        at: bucket.starting_at,
        inputTokens: item.uncached_input_tokens,
        outputTokens: item.output_tokens,
        cacheReadTokens: item.cache_read_input_tokens,
        cacheWrite5mTokens: write5m,
        cacheWrite1hTokens: write1h,
      });

      if (cents === null) {
        // A model with no price on file. Counted in the token totals but left
        // out of the money, and named, so an underestimate never passes as a
        // complete one.
        unpriced.add(model);
        continue;
      }

      if (sinceCredit) sinceCreditCents += cents;
      if (!inMonth) continue;

      monthToDateCents += cents;

      const row = perModel.get(model) ?? { cents: 0, outputTokens: 0 };
      row.cents += cents;
      row.outputTokens += item.output_tokens;
      perModel.set(model, row);
    }

    // The last bucket that actually carried usage, not the last one returned —
    // the report pads the window with empty buckets right up to the present.
    if (
      bucket.results.length > 0 &&
      Date.parse(bucket.starting_at) >= monthStart.getTime()
    ) {
      through = bucket.starting_at;
    }
  }

  return {
    monthToDateCents: Math.round(monthToDateCents),
    sinceCreditCents: creditInReach ? Math.round(sinceCreditCents) : null,
    through,
    monthInputTokens,
    monthOutputTokens,
    monthCacheReadTokens,
    monthCacheWriteTokens,
    unpricedModels: [...unpriced],
    models: [...perModel.values()]
      .map((row, index) => ({ model: [...perModel.keys()][index], ...row }))
      .sort((a, b) => b.cents - a.cents),
  };
}
