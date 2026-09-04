import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { UsageRefreshButton } from "@/components/usage/refresh-button";
import { CreditForm } from "@/components/usage/credit-form";
import { ThresholdsForm } from "@/components/usage/thresholds-form";
import { UsageWarnings } from "@/components/usage/usage-warnings";
import {
  AnthropicCard,
  OpenAiCard,
  TwilioCard,
} from "@/components/usage/provider-cards";
import { requirePlatformAdmin } from "@/lib/orgs/context";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { fetchLiveUsage } from "@/lib/usage/anthropic-live";
import { estimateAiSpend } from "@/lib/usage/ai-spend";
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

  const [twilio, anthropic, openai, live] = await Promise.all([
    fetchTwilioUsage(),
    estimateAiSpend(supabase, { provider: "anthropic" }),
    // Priced from this app's own drafts and, unlike Anthropic's, with no live
    // report to fall back on — see `OpenAiCard`. The credit timestamp is passed
    // in because the remaining figure is spend *since* it.
    estimateAiSpend(supabase, {
      provider: "openai",
      creditAt: settings?.openai_credit_at
        ? new Date(settings.openai_credit_at)
        : null,
    }),
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

  const openaiCreditCents = settings?.openai_credit_cents ?? null;
  const openaiCreditAt = settings?.openai_credit_at ?? null;

  const lowBalanceCents = settings?.twilio_low_balance_cents ?? 1000;
  const budgetCents = settings?.anthropic_monthly_budget_cents ?? null;
  const openaiBudgetCents = settings?.openai_monthly_budget_cents ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="h-20 shrink-0 border-b">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1400px] items-center pr-52 pl-14 md:pl-6 lg:pl-10 justify-between gap-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">
            Usage
          </h1>
          <div className="flex min-w-0 items-center gap-1">
            <span className="text-muted-foreground hidden truncate text-xs sm:inline">
              {live
                ? "Live from Twilio and Anthropic · estimated for OpenAI"
                : "Live from Twilio · estimated for Anthropic and OpenAI"}
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
            openai={openai}
            lowBalanceCents={lowBalanceCents}
            budgetCents={budgetCents}
            openaiBudgetCents={openaiBudgetCents}
          />

          {/* Three across on a wide screen now that there are three providers,
              two on a medium one, stacked on a phone. */}
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <TwilioCard usage={twilio} lowBalanceCents={lowBalanceCents} />
            <AnthropicCard
              estimate={anthropic}
              live={live}
              creditCents={creditCents}
              creditAt={creditAt}
              budgetCents={budgetCents}
            />
            <OpenAiCard
              estimate={openai}
              creditCents={openaiCreditCents}
              creditAt={openaiCreditAt}
              budgetCents={openaiBudgetCents}
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
              openaiBudgetCents={openaiBudgetCents}
            />

            <div className="grid max-w-3xl gap-4 border-t pt-4 md:grid-cols-2">
              <CreditForm provider="anthropic" creditCents={creditCents} />
              <CreditForm provider="openai" creditCents={openaiCreditCents} />
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

            <p className="text-muted-foreground flex items-start gap-2 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                The OpenAI figure is always an estimate, for the same kind of
                reason: <code>/v1/organization/costs</code> needs a key carrying
                the <code>api.usage.read</code> scope, and the{" "}
                <code>sk-proj-…</code> key this app uses for chat is refused
                with a 403. So it is this app&apos;s own logged tokens priced at
                published rates — a floor on what was spent, blind to anything
                else using the same account. Note that OpenAI reports cost but
                never the prepaid balance left, so even a scoped key would not
                remove the recorded balance below.
              </span>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
