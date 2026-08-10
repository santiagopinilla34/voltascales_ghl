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
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold tracking-tight">Automations</h1>
          <span className="text-muted-foreground text-xs tabular-nums">
            {activeCount} of {automations.length} active
          </span>
        </div>

        <Button asChild size="sm">
          <Link href="/automations/new">
            <Plus className="size-4" />
            New rule
          </Link>
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl">
          <AutomationsList automations={automations} />
        </div>
      </div>
    </div>
  );
}
