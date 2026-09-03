import Link from "next/link";
import { ExternalLink, TriangleAlert } from "lucide-react";

import type { AiSpendEstimate } from "@/lib/usage/ai-spend";
import type { TwilioUsageResult } from "@/lib/usage/twilio";
import { buildWarnings } from "@/lib/usage/warnings";
import { cn } from "@/lib/utils";

/**
 * The banners at the top of the Usage page.
 *
 * The rule that decides what counts as a warning lives in
 * `src/lib/usage/warnings.ts`, not here — the notification bubble raises the
 * same ones, and two copies of "the balance is low" would eventually disagree.
 * This file is only how they look on this page.
 */

export function UsageWarnings({
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
  budgetCents: number | null;
  openaiBudgetCents: number | null;
}) {
  const warnings = buildWarnings({
    twilio,
    anthropic,
    openai,
    lowBalanceCents,
    budgetCents,
    openaiBudgetCents,
  });

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
