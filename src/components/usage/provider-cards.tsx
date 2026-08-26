import Link from "next/link";
import { Bot, ExternalLink, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatUsdCents } from "@/lib/usage/pricing";
import { aiModelLabel } from "@/lib/ai/models";
import type { LiveUsage } from "@/lib/usage/anthropic-live";
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
      <dd
        className={cn(
          "truncate tabular-nums",
          muted && "text-muted-foreground",
        )}
      >
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
                usage.todayCents === null
                  ? "—"
                  : formatUsdCents(usage.todayCents)
              }
              muted={usage.todayCents === null}
            />
            <Row
              label="Warn below"
              value={formatUsdCents(lowBalanceCents)}
              muted
            />
          </dl>
        </>
      )}
    </Card>
  );
}

export function AnthropicCard({
  estimate,
  live,
  creditCents,
  creditAt,
  budgetCents,
}: {
  estimate: AnthropicEstimate;
  /** Anthropic's own usage report, when an Admin API key is configured. */
  live: LiveUsage | null;
  /** The balance as last recorded from the Console, in cents. */
  creditCents: number | null;
  /** When it was recorded, for the caption under it. */
  creditAt: string | null;
  budgetCents: number | null;
}) {
  // Anthropic's own numbers when we can read them, the estimate when we
  // cannot. The two answer
  // different questions — the report covers every use of the account and prices
  // cached tokens correctly, the estimate covers only this app and only what it
  // logged — so the headline is whichever is closer to true, and the card says
  // which one it is rather than leaving the reader to guess.
  const cents = live ? live.monthToDateCents : estimate.monthToDateCents;

  // Only when all three are in hand: a balance, when it was true, and the
  // usage since. Any one missing and there is no honest remaining figure, so
  // the card shows spend alone rather than a number with a caveat attached.
  const remainingCents =
    creditCents !== null && live?.sinceCreditCents !== null && live
      ? Math.max(creditCents - live.sinceCreditCents, 0)
      : null;

  const percent =
    budgetCents !== null && budgetCents > 0
      ? Math.round((cents / budgetCents) * 100)
      : null;

  return (
    <Card
      icon={Bot}
      title="Anthropic"
      badge={{ label: live ? "Live" : "Estimate", live: Boolean(live) }}
      href="https://console.anthropic.com/settings/billing"
      linkLabel="Anthropic billing"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-2xl font-semibold tabular-nums">
            {live ? "" : "~"}
            {formatUsdCents(cents)}
          </p>
          <p className="text-muted-foreground text-xs">
            {live ? "used this month" : "estimated spend this month"}
            {percent !== null && ` · ${percent}% of budget`}
          </p>
        </div>

        {remainingCents !== null && creditCents !== null && (
          <div className="text-right">
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                remainingCents === 0 && "text-destructive",
              )}
            >
              {formatUsdCents(remainingCents)}
            </p>
            <p className="text-muted-foreground text-xs">
              left of {formatUsdCents(creditCents)}
            </p>
          </div>
        )}
      </div>

      {budgetCents !== null && (
        <div
          className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={Math.min(percent ?? 0, 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Anthropic spend against budget"
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

        {/* Only alongside the bill. On its own the estimate *is* the headline,
            and repeating it underneath would read as two different figures. */}
        {live && (
          <Row
            label="This app’s share"
            value={`~${formatUsdCents(estimate.monthToDateCents)} of the above`}
            muted
          />
        )}

        {creditAt && remainingCents !== null && (
          <Row
            label="Balance recorded"
            value={new Date(creditAt).toLocaleString("en-CA", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              timeZone: "America/Toronto",
            })}
            muted
          />
        )}

        {live && (
          <Row
            label="Current to"
            value={
              live.through
                ? new Date(live.through).toLocaleString("en-CA", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    timeZone: "America/Toronto",
                  })
                : "nothing yet this month"
            }
            muted
          />
        )}
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
