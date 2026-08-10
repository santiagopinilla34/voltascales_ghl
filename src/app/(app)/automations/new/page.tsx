import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AutomationEditor } from "@/components/automations/automation-editor";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "New rule · Automations · VoltaScales" };

/**
 * Draft a new rule.
 *
 * A static segment, so it wins over `[automationId]` and "new" can never be
 * mistaken for an id. The editor holds the draft and inserts nothing until it
 * validates, which is why there's no run log beside it — there are no runs to
 * show and no row to have produced them.
 */
export default function NewAutomationPage() {
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
        <h1 className="text-sm font-semibold tracking-tight">New rule</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-xl">
          <AutomationEditor automation={null} />
        </div>
      </div>
    </div>
  );
}
