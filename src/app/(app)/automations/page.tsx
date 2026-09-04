import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Zap } from "lucide-react";

import { AutomationsList } from "@/components/automations/automations-list";
import { Button } from "@/components/ui/button";
import { getAutomationStats, listAutomations } from "@/lib/automations/queries";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Automations · VoltaScales" };

export default async function AutomationsPage() {
  const supabase = await createClient();
  const [automations, stats] = await Promise.all([
    listAutomations(supabase),
    getAutomationStats(supabase),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Title, count and the one action, on a single row with no rule under
          it — the stats bar below already draws the line the border used to. */}
      <header className="shrink-0 px-4 pt-6 pb-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] items-center justify-between gap-3 pr-52">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="shrink-0 text-xl font-semibold tracking-tight">
              Automations
            </h1>
            <span className="text-muted-foreground truncate text-sm tabular-nums">
              {stats.activeRules} of {stats.totalRules} active
            </span>
          </div>

          <Button
            asChild
            className="h-10 shrink-0 gap-2 border border-emerald-600 bg-emerald-950 px-4 text-white hover:bg-emerald-900"
          >
            <Link href="/automations/new">
              <Plus className="size-4" />
              New rule
            </Link>
          </Button>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-10">
        <div className="mx-auto w-full min-w-0 max-w-[1400px]">
          {/*
            The state of the machinery, before the list of parts.

            The list alone answers "what rules exist" and nothing about whether
            they are working — eight rows of green switches look identical
            whether the week went perfectly or every run failed. These five
            figures are the difference, and the failed count is the one the
            whole bar is for: it is the only number here that should ever make
            someone stop and open a rule.
          */}
          <section
            aria-label="Automation activity"
            className="bg-card/50 mb-4 flex flex-wrap items-center gap-y-4 rounded-xl border p-6"
          >
            <div className="flex min-w-0 items-center gap-4 pr-8">
              <span
                className="flex size-14 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                aria-hidden
              >
                <Zap className="size-6" />
              </span>

              <div className="min-w-0">
                <p className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums">
                    {stats.activeRules}
                  </span>
                  <span className="text-sm">Active rules</span>
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {stats.failedRuns === 0
                    ? "All systems operational"
                    : `${stats.failedRuns} ${stats.failedRuns === 1 ? "run" : "runs"} failed this week`}
                </p>
              </div>
            </div>

            <Stat label="Total rules" value={stats.totalRules} />
            <Stat
              label="Ran this week"
              value={stats.ranThisWeek}
              tone="text-sky-300"
            />
            <Stat
              label="Successful runs"
              value={stats.successfulRuns}
              tone="text-emerald-400"
            />
            <Stat
              label="Failed runs"
              value={stats.failedRuns}
              // Zero failures is good news and should read as calm, not as an
              // alarm that happens to be at rest.
              tone={stats.failedRuns > 0 ? "text-rose-400" : undefined}
            />
          </section>

          <AutomationsList automations={automations} />
        </div>
      </div>
    </div>
  );
}

/** One counter in the bar, with the hairline that separates it from the last. */
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="min-w-36 border-l px-8">
      <p className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{label}</p>
    </div>
  );
}
