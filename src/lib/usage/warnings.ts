import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Alert } from "@/lib/alerts";
import { getSettings } from "@/lib/settings";
import { estimateAiSpend, type AiSpendEstimate } from "@/lib/usage/ai-spend";
import { formatUsdCents } from "@/lib/usage/pricing";
import { fetchTwilioUsage, type TwilioUsageResult } from "@/lib/usage/twilio";
import type { Database } from "@/types/database";

/**
 * Threshold warnings for the Twilio balance and the Anthropic estimate.
 *
 * Lifted out of `components/usage/usage-warnings.tsx` so the top bar can raise
 * the same warnings the Usage page does. There is exactly one definition of
 * "the balance is low", which is the point: a bell that disagreed with the page
 * it links to would be worse than no bell.
 *
 * The Usage page still renders these as banners; the top bar maps them to
 * alerts. Neither owns the rule.
 */

/** Where each provider's top-up page lives. */
const BILLING = {
  twilio: "https://console.twilio.com/us1/billing/manage-billing/billing-overview",
  anthropic: "https://console.anthropic.com/settings/billing",
  openai: "https://platform.openai.com/settings/organization/billing/overview",
} as const;

/** Fraction of budget at which a model-spend warning appears. */
const BUDGET_WARN_AT = 0.8;

/** The model providers that can carry a budget. Twilio is a balance, not a budget. */
const MODEL_PROVIDERS = {
  anthropic: { label: "Anthropic", billing: BILLING.anthropic },
  openai: { label: "OpenAI", billing: BILLING.openai },
} as const;

type ModelProvider = keyof typeof MODEL_PROVIDERS;

/**
 * Budget warnings for one model provider.
 *
 * Written once and called per provider rather than copied. The rule is not
 * provider-specific — it is "spend against a ceiling the operator set" — and
 * two hand-maintained copies of it would eventually warn at different
 * percentages, which is exactly the drift the module docstring above exists to
 * prevent.
 */
function budgetWarnings(
  provider: ModelProvider,
  estimate: AiSpendEstimate,
  budgetCents: number | null,
): Warning[] {
  if (budgetCents === null || budgetCents <= 0) return [];

  const { label, billing } = MODEL_PROVIDERS[provider];
  const used = estimate.monthToDateCents / budgetCents;

  if (used >= 1) {
    return [
      {
        id: `${provider}-over`,
        level: "critical",
        title: `${label} estimate is over budget`,
        detail:
          `About ${formatUsdCents(estimate.monthToDateCents)} estimated this ` +
          `month against a ${formatUsdCents(budgetCents)} budget. This is an ` +
          `estimate from logged token usage, not a bill.`,
        href: billing,
        cta: `Open ${label} billing`,
      },
    ];
  }

  if (used >= BUDGET_WARN_AT) {
    return [
      {
        id: `${provider}-near`,
        level: "warn",
        title: `${label} estimate near budget`,
        detail:
          `About ${Math.round(used * 100)}% of your ` +
          `${formatUsdCents(budgetCents)} monthly budget, estimated from logged ` +
          `token usage.`,
        href: billing,
        cta: `Open ${label} billing`,
      },
    ];
  }

  return [];
}

export type Warning = {
  id: string;
  level: "warn" | "critical";
  title: string;
  detail: string;
  href: string;
  cta: string;
};

/**
 * Builds the banner list.
 *
 * The two providers get different triggers because they expose different
 * things. Twilio reports a balance but never what a full one was, so "80% used"
 * has no denominator and a floor is the honest trigger. Anthropic exposes
 * nothing at all to this key, so the only percentage available is against a
 * budget the operator set — and with no budget there is simply no warning
 * rather than one invented from a made-up ceiling.
 */
export function buildWarnings({
  twilio,
  anthropic,
  openai,
  lowBalanceCents,
  budgetCents,
  openaiBudgetCents,
}: {
  twilio: TwilioUsageResult;
  anthropic: AiSpendEstimate;
  openai: AiSpendEstimate;
  lowBalanceCents: number;
  /** The Anthropic ceiling. Null means no budget and no warning. */
  budgetCents: number | null;
  /** The OpenAI one, tracked separately — different account, different credit. */
  openaiBudgetCents: number | null;
}): Warning[] {
  const warnings: Warning[] = [];

  if (!twilio.ok) {
    warnings.push({
      id: "twilio-unreachable",
      level: "warn",
      title: "Twilio balance unavailable",
      detail: `Could not read the account balance: ${twilio.error}`,
      href: BILLING.twilio,
      cta: "Open Twilio billing",
    });
  } else if (twilio.balanceCents <= 0) {
    warnings.push({
      id: "twilio-empty",
      level: "critical",
      title: "Twilio balance is empty",
      detail:
        "Calls and texts will fail until the account is topped up. This stops " +
        "the missed-call auto-text and every other outbound message.",
      href: BILLING.twilio,
      cta: "Top up Twilio",
    });
  } else if (twilio.balanceCents < lowBalanceCents) {
    warnings.push({
      id: "twilio-low",
      level: "warn",
      title: "Twilio balance is low",
      detail:
        `${formatUsdCents(twilio.balanceCents)} left, below your ` +
        `${formatUsdCents(lowBalanceCents)} floor.` +
        (twilio.monthToDateCents !== null
          ? ` You have spent ${formatUsdCents(twilio.monthToDateCents)} this month.`
          : ""),
      href: BILLING.twilio,
      cta: "Top up Twilio",
    });
  }

  warnings.push(...budgetWarnings("anthropic", anthropic, budgetCents));
  warnings.push(...budgetWarnings("openai", openai, openaiBudgetCents));

  return warnings;
}

// ---------------------------------------------------------------------------
// Cached read, for the top bar
// ---------------------------------------------------------------------------

/**
 * How long a Twilio balance is reused for.
 *
 * The top bar renders on every authenticated page, and `fetchTwilioUsage` is
 * three HTTP calls to Twilio with an eight-second timeout and `no-store`.
 * Uncached, that would put up to eight seconds on every navigation in the app
 * and hammer the API with one round trip per page view.
 *
 * Five minutes is well inside the useful window for "you are running out of
 * credit" — a balance that crosses the floor is not an emergency measured in
 * seconds — and the Usage page still reads through uncached, so there is always
 * one screen showing the live figure.
 */
const USAGE_TTL_MS = 5 * 60_000;

/**
 * Failures are cached too, but briefly.
 *
 * Retrying a dead Twilio on every page view is the same stampede the cache
 * exists to prevent, and an unreachable-balance warning that lingers five
 * minutes after the outage ended reads as a bug. A minute splits the two.
 */
const FAILURE_TTL_MS = 60_000;

/**
 * Process-local, deliberately. This is a warm-instance memo, not a shared
 * cache: on serverless each instance calls Twilio at most once per window,
 * which is the entire problem solved. A shared cache would mean a network hop
 * to save a network hop.
 */
let memo: { at: number; value: TwilioUsageResult } | null = null;

async function cachedTwilioUsage(): Promise<TwilioUsageResult> {
  const now = Date.now();
  const ttl = memo?.value.ok ? USAGE_TTL_MS : FAILURE_TTL_MS;

  if (memo && now - memo.at < ttl) {
    return memo.value;
  }

  const value = await fetchTwilioUsage();
  memo = { at: now, value };
  return value;
}

/**
 * The usage warnings, as alerts for the notification bubble.
 *
 * These are a current state rather than an event, so `at` is when the check
 * ran. They link to `/usage` rather than straight out to the provider's billing
 * page: the alert says something is wrong, and the Usage page is where you see
 * the actual numbers and find the top-up link.
 */
export async function getUsageAlerts(
  supabase: SupabaseClient<Database>,
): Promise<Alert[]> {
  const [settings, twilio, anthropic, openai] = await Promise.all([
    getSettings(supabase),
    cachedTwilioUsage(),
    estimateAiSpend(supabase, { provider: "anthropic" }),
    estimateAiSpend(supabase, { provider: "openai" }),
  ]);

  const checkedAt = new Date().toISOString();

  return buildWarnings({
    twilio,
    anthropic,
    openai,
    lowBalanceCents: settings?.twilio_low_balance_cents ?? 1000,
    budgetCents: settings?.anthropic_monthly_budget_cents ?? null,
    openaiBudgetCents: settings?.openai_monthly_budget_cents ?? null,
  }).map((warning) => ({
    id: `usage-${warning.id}`,
    kind: "usage" as const,
    level: warning.level,
    title: warning.title,
    detail: warning.detail,
    href: "/usage",
    at: checkedAt,
    read: false,
  }));
}
