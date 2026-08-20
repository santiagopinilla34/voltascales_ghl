import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { AutomationsList } from "@/components/automations/automations-list";
import { Button } from "@/components/ui/button";
import { listAutomations } from "@/lib/automations/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Automations · VoltaScales" };

export default async function AutomationsPage() {
  const supabase = await createClient();
  const automations = await listAutomations(supabase);

  const activeCount = automations.filter((rule) => rule.active).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1140px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="shrink-0 text-sm font-semibold tracking-tight">
              Automations
            </h1>
            <span className="text-muted-foreground truncate text-xs tabular-nums">
              {activeCount} of {automations.length} active
            </span>
          </div>

          <Button asChild size="sm" className="shrink-0">
            <Link href="/automations/new">
              <Plus className="size-4" />
              New rule
            </Link>
          </Button>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10">
        <div className="mx-auto w-full min-w-0 max-w-[1140px]">
          <AutomationsList automations={automations} />
        </div>
      </div>
    </div>
  );
}
