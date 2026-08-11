import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AutomationEditor } from "@/components/automations/automation-editor";
import { RunLog } from "@/components/automations/run-log";
import { TriggerBadge } from "@/components/automations/trigger-meta";
import { Button } from "@/components/ui/button";
import {
  RUN_LOG_LIMIT,
  getAutomation,
  listRuns,
} from "@/lib/automations/queries";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ automationId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { automationId } = await params;
  const supabase = await createClient();
  const automation = await getAutomation(supabase, automationId);

  return {
    title: automation
      ? `${automation.name} · Automations · VoltaScales`
      : "Automations · VoltaScales",
  };
}

export default async function AutomationDetailPage({ params }: PageProps) {
  const { automationId } = await params;
  const supabase = await createClient();

  const automation = await getAutomation(supabase, automationId);
  if (!automation) {
    notFound();
  }

  const runs = await listRuns(supabase, automation.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3 md:px-4">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Back to automations"
        >
          <Link href="/automations">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            {automation.name}
          </h1>
          <TriggerBadge trigger={automation.trigger_type} />
          {!automation.active && (
            <span className="text-muted-foreground text-[10px] font-medium uppercase">
              Paused
            </span>
          )}
        </div>
      </header>

      {/* Editor and log side by side on wide screens: the log is what tells you
          whether the edit you just made did what you meant. */}
      {/* One scrolling column below `lg`: the editor and the log each expect to
          scroll inside a fixed-height pane, which a phone viewport cannot give
          both of them without clipping one against the shell's overflow. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="min-w-0 flex-1 px-4 py-4 lg:min-h-0 lg:overflow-y-auto">
          <div className="mx-auto max-w-xl">
            <AutomationEditor automation={automation} />
          </div>
        </div>

        <aside className="w-full min-w-0 border-t p-4 lg:w-96 lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <h2 className="mb-3 text-sm font-semibold tracking-tight">
            Run log
            {runs.length > 0 && (
              <span className="text-muted-foreground ml-1.5 text-xs font-normal tabular-nums">
                {runs.length}
              </span>
            )}
          </h2>
          <RunLog runs={runs} limit={RUN_LOG_LIMIT} />
        </aside>
      </div>
    </div>
  );
}
