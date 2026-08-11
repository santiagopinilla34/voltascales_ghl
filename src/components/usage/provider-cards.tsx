import Link from "next/link";
import { Bot, ExternalLink, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatUsdCents } from "@/lib/usage/pricing";
import { aiModelLabel } from "@/lib/ai/models";
import type { AnthropicEstimate } from "@/lib/usage/anthropic";
import type { TwilioUsageResult } from "@/lib/usage/twilio";
import { cn } from "@/lib/utils";

function Card({
  icon: Icon,
  title,
  badge,
  href,
  linkLabel,
  children,
}: {
  icon: typeof Phone;
  title: string;
  badge: { label: string; live: boolean };
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="text-muted-foreground size-4 shrink-0" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
          {title}
        </h2>
        <Badge
          variant={badge.live ? "secondary" : "outline"}
          className="shrink-0 text-[10px]"
        >
          {badge.label}
        </Badge>
      </div>

      {children}

      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline underline-offset-2"
      >
        {linkLabel}
        <ExternalLink className="size-3" />
      </Link>
    </section>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className={cn("truncate tabular-nums", muted && "text-muted-foreground")}>
        {value}
      </dd>
    </div>
  );
}

export function TwilioCard({
  usage,
  lowBalanceCents,
}: {
  usage: TwilioUsageResult;
  lowBalanceCents: number;
}) {
  return (
    <Card
      icon={Phone}
      title="Twilio"
      badge={{ label: usage.ok ? "Live" : "Unavailable", live: usage.ok }}
      href="https://console.twilio.com/us1/billing/manage-billing/billing-overview"
      linkLabel="Twilio billing"
    >
      {!usage.ok ? (
        <p className="text-muted-foreground text-xs">
          Could not reach Twilio: {usage.error}
        </p>
      ) : (
        <>
          <div>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                usage.balanceCents < lowBalanceCents && "text-destructive",
              )}
            >
              {formatUsdCents(usage.balanceCents)}
            </p>
            <p className="text-muted-foreground text-xs">
              remaining balance ({usage.currency})
            </p>
          </div>

          <dl className="flex flex-col gap-1.5 border-t pt-3">
            <Row
              label="Spent this month"
              value={
                usage.monthToDateCents === null
                  ? "—"
                  : formatUsdCents(usage.monthToDateCents)
              }
              muted={usage.monthToDateCents === null}
            />
            <Row
              label="Spent today"
              value={
                usage.todayCents === null ? "—" : formatUsdCents(usage.todayCents)
              }
              muted={usage.todayCents === null}
            />
            <Row label="Warn below" value={formatUsdCents(lowBalanceCents)} muted />
          </dl>
        </>
      )}
    </Card>
  );
}

export function AnthropicCard({
  estimate,
  budgetCents,
}: {
  estimate: AnthropicEstimate;
  budgetCents: number | null;
}) {
  const percent =
    budgetCents !== null && budgetCents > 0
      ? Math.round((estimate.monthToDateCents / budgetCents) * 100)
      : null;

  return (
    <Card
      icon={Bot}
      title="Anthropic"
      badge={{ label: "Estimate", live: false }}
      href="https://console.anthropic.com/settings/billing"
      linkLabel="Anthropic billing"
    >
      <div>
        <p className="text-2xl font-semibold tabular-nums">
          ~{formatUsdCents(estimate.monthToDateCents)}
        </p>
        <p className="text-muted-foreground text-xs">
          estimated spend this month
          {percent !== null && ` · ${percent}% of budget`}
        </p>
      </div>

      {budgetCents !== null && (
        <div
          className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={Math.min(percent ?? 0, 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Estimated Anthropic spend against budget"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              (percent ?? 0) >= 100
                ? "bg-destructive"
                : (percent ?? 0) >= 80
                  ? "bg-amber-500"
                  : "bg-primary",
            )}
            style={{ width: `${Math.min(percent ?? 0, 100)}%` }}
          />
        </div>
      )}

      <dl className="flex flex-col gap-1.5 border-t pt-3">
        <Row
          label="Budget"
          value={budgetCents === null ? "Not set" : formatUsdCents(budgetCents)}
          muted={budgetCents === null}
        />
        <Row
          label="Replies this month"
          value={estimate.monthDrafts.toLocaleString("en-CA")}
        />
        <Row
          label="Tokens this month"
          value={`${estimate.monthInputTokens.toLocaleString("en-CA")} in / ${estimate.monthOutputTokens.toLocaleString("en-CA")} out`}
        />
        <Row
          label="All time"
          value={`~${formatUsdCents(estimate.allTimeCents)} · ${estimate.totalDrafts.toLocaleString("en-CA")} replies`}
          muted
        />
      </dl>

      {estimate.models.length > 0 && (
        <dl className="flex flex-col gap-1.5 border-t pt-3">
          {estimate.models.map((entry) => (
            <Row
              key={entry.model}
              label={aiModelLabel(entry.model)}
              value={`~${formatUsdCents(entry.cents)} · ${entry.drafts}`}
            />
          ))}
        </dl>
      )}

      {estimate.unpricedDrafts > 0 && (
        // Surfaced rather than folded in: an unknown model priced at a
        // neighbour's rate would make an incomplete total look complete.
        <p className="text-muted-foreground text-[11px]">
          {estimate.unpricedDrafts} replies excluded — no price on file for
          their model.
        </p>
      )}
    </Card>
  );
}
