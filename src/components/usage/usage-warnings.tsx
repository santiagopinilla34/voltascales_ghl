import Link from "next/link";
import { ExternalLink, TriangleAlert } from "lucide-react";

import { formatUsdCents } from "@/lib/usage/pricing";
import type { AnthropicEstimate } from "@/lib/usage/anthropic";
import type { TwilioUsageResult } from "@/lib/usage/twilio";
import { cn } from "@/lib/utils";

/** Where each provider's top-up page lives. */
const BILLING = {
  twilio: "https://console.twilio.com/us1/billing/manage-billing/billing-overview",
  anthropic: "https://console.anthropic.com/settings/billing",
} as const;

/** Fraction of budget at which the Anthropic warning appears. */
const BUDGET_WARN_AT = 0.8;

type Warning = {
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
function buildWarnings(
  twilio: TwilioUsageResult,
  anthropic: AnthropicEstimate,
  lowBalanceCents: number,
  budgetCents: number | null,
): Warning[] {
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

  if (budgetCents !== null) {
    const used = anthropic.monthToDateCents / budgetCents;

    if (used >= 1) {
      warnings.push({
        id: "anthropic-over",
        level: "critical",
        title: "Anthropic estimate is over budget",
        detail:
          `About ${formatUsdCents(anthropic.monthToDateCents)} estimated this ` +
          `month against a ${formatUsdCents(budgetCents)} budget. This is an ` +
          `estimate from logged token usage, not a bill.`,
        href: BILLING.anthropic,
        cta: "Open Anthropic billing",
      });
    } else if (used >= BUDGET_WARN_AT) {
      warnings.push({
        id: "anthropic-near",
        level: "warn",
        title: "Anthropic estimate near budget",
        detail:
          `About ${Math.round(used * 100)}% of your ` +
          `${formatUsdCents(budgetCents)} monthly budget, estimated from logged ` +
          `token usage.`,
        href: BILLING.anthropic,
        cta: "Open Anthropic billing",
      });
    }
  }

  return warnings;
}

export function UsageWarnings({
  twilio,
  anthropic,
  lowBalanceCents,
  budgetCents,
}: {
  twilio: TwilioUsageResult;
  anthropic: AnthropicEstimate;
  lowBalanceCents: number;
  budgetCents: number | null;
}) {
  const warnings = buildWarnings(twilio, anthropic, lowBalanceCents, budgetCents);

  if (warnings.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {warnings.map((warning) => (
        <div
          key={warning.id}
          role="alert"
          className={cn(
            "flex min-w-0 flex-col gap-2 rounded-md border px-3 py-2.5 text-xs sm:flex-row sm:items-start",
            warning.level === "critical"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
          )}
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />

          <div className="min-w-0 flex-1">
            <p className="font-medium">{warning.title}</p>
            <p className="opacity-90">{warning.detail}</p>
          </div>

          <Link
            href={warning.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 font-medium underline underline-offset-2"
          >
            {warning.cta}
            <ExternalLink className="size-3" />
          </Link>
        </div>
      ))}
    </div>
  );
}
