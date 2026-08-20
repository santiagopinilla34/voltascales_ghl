import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { ThresholdsForm } from "@/components/usage/thresholds-form";
import { UsageWarnings } from "@/components/usage/usage-warnings";
import { AnthropicCard, TwilioCard } from "@/components/usage/provider-cards";
import { requirePlatformAdmin } from "@/lib/orgs/context";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
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

  const [settings, twilio, anthropic] = await Promise.all([
    getSettings(supabase),
    fetchTwilioUsage(),
    estimateAnthropicSpend(supabase),
  ]);

  const lowBalanceCents = settings?.twilio_low_balance_cents ?? 1000;
  const budgetCents = settings?.anthropic_monthly_budget_cents ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1140px] items-center justify-between gap-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">Usage</h1>
          <span className="text-muted-foreground hidden text-xs sm:inline">
            Live from Twilio · estimated for Anthropic
          </span>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full min-w-0 max-w-[1140px] flex-col gap-6 pb-4">
          <UsageWarnings
            twilio={twilio}
            anthropic={anthropic}
            lowBalanceCents={lowBalanceCents}
            budgetCents={budgetCents}
          />

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <TwilioCard usage={twilio} lowBalanceCents={lowBalanceCents} />
            <AnthropicCard estimate={anthropic} budgetCents={budgetCents} />
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
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              What these numbers are
            </h2>
            <p className="text-muted-foreground flex items-start gap-2 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                The Twilio figures are live from your account. The Anthropic
                figure is <strong>not</strong> a balance — it is this app&apos;s
                own logged token usage priced at published rates. It cannot see
                spend from anywhere else, and it does not know about any
                discount on your account. Real Anthropic usage data needs an
                Admin API key (<code>sk-ant-admin-…</code>), which is a separate
                credential from the one this app uses for chat.
              </span>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
