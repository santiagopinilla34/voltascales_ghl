import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { UsageRefreshButton } from "@/components/usage/refresh-button";
import { CreditForm } from "@/components/usage/credit-form";
import { ThresholdsForm } from "@/components/usage/thresholds-form";
import { UsageWarnings } from "@/components/usage/usage-warnings";
import { AnthropicCard, TwilioCard } from "@/components/usage/provider-cards";
import { requirePlatformAdmin } from "@/lib/orgs/context";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { fetchLiveUsage } from "@/lib/usage/anthropic-live";
import { estimateAnthropicSpend } from "@/lib/usage/anthropic";
import { fetchTwilioUsage } from "@/lib/usage/twilio";

export const metadata: Metadata = { title: "Usage · VoltaScales" };

// Balances are the point of this page; a cached one would be actively
// misleading, so it re-reads both providers on every visit.
export const dynamic = "force-dynamic";

export default async function UsagePage() {
  // Agency only, and checked here rather than trusted from the sidebar. The
  // `platformOnly` flag there decides whether a link is drawn; this decides
  // whether the page renders. Spend across every provider is the agency's
  // business, not a client's.
  await requirePlatformAdmin();

  const supabase = await createClient();

  // Settings first, alone: the live call needs to know when the credit balance
  // was recorded so it can price the usage since, and that is on the row.
  const settings = await getSettings(supabase);

  const [twilio, anthropic, live] = await Promise.all([
    fetchTwilioUsage(),
    estimateAnthropicSpend(supabase),
    // Null without an Admin API key, or if the call fails. The card falls back
    // to the estimate rather than the page failing over its own footnote.
    fetchLiveUsage({
      creditAt: settings?.anthropic_credit_at
        ? new Date(settings.anthropic_credit_at)
        : null,
    }),
  ]);

  const creditCents = settings?.anthropic_credit_cents ?? null;
  const creditAt = settings?.anthropic_credit_at ?? null;

  const lowBalanceCents = settings?.twilio_low_balance_cents ?? 1000;
  const budgetCents = settings?.anthropic_monthly_budget_cents ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1400px] items-center justify-between gap-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">
            Usage
          </h1>
          <div className="flex min-w-0 items-center gap-1">
            <span className="text-muted-foreground hidden truncate text-xs sm:inline">
              {live
                ? "Live from Twilio and Anthropic"
                : "Live from Twilio · estimated for Anthropic"}
            </span>
            <UsageRefreshButton />
          </div>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-6 pb-4">
          <UsageWarnings
            twilio={twilio}
            anthropic={anthropic}
            lowBalanceCents={lowBalanceCents}
            budgetCents={budgetCents}
          />

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <TwilioCard usage={twilio} lowBalanceCents={lowBalanceCents} />
            <AnthropicCard
              estimate={anthropic}
              live={live}
              creditCents={creditCents}
              creditAt={creditAt}
              budgetCents={budgetCents}
            />
          </div>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Warning thresholds
              </h2>
              <p className="text-muted-foreground text-xs">
                When to show the banner above.
              </p>
            </div>
            <ThresholdsForm
              lowBalanceCents={lowBalanceCents}
              budgetCents={budgetCents}
            />

            <div className="max-w-md border-t pt-4">
              <CreditForm creditCents={creditCents} />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              What these numbers are
            </h2>
            <p className="text-muted-foreground flex items-start gap-2 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {live ? (
                <span>
                  Both figures are live from the provider. The Anthropic one is
                  Anthropic&apos;s own usage report, current to the last hour,
                  covering <strong>every</strong> use of the account — this app,
                  the Console playground, Claude Code, anything else holding a
                  key. It is priced here at published list rates, so it is what
                  the usage is worth rather than what was invoiced: any discount
                  on your account is invisible to it. &ldquo;This app&apos;s
                  share&rdquo; is the app&apos;s own logged tokens, kept beside
                  it so you can see how much of the total is this CRM.
                </span>
              ) : (
                <span>
                  The Twilio figures are live from your account. The Anthropic
                  figure is <strong>not</strong> a balance — it is this
                  app&apos;s own logged token usage priced at published rates.
                  It cannot see spend from anywhere else, and it does not know
                  about any discount on your account. Real Anthropic usage data
                  needs an Admin API key (<code>sk-ant-admin01-…</code>), set as{" "}
                  <code>ANTHROPIC_ADMIN_API_KEY</code>, which is a separate
                  credential from the one this app uses for chat.
                </span>
              )}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
