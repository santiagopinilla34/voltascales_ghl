import type { Metadata } from "next";

import { AddToPipelineDialog } from "@/components/pipeline/add-to-pipeline-dialog";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { listContactsNotOnPipeline, listPipeline } from "@/lib/pipeline";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pipeline · VoltaScales" };

export default async function PipelinePage() {
  const supabase = await createClient();
  const [columns, candidates] = await Promise.all([
    listPipeline(supabase),
    listContactsNotOnPipeline(supabase),
  ]);

  const total = columns.reduce((sum, column) => sum + column.cards.length, 0);

  return (
    // Same shape as the Contacts page: a fixed header over a single scrolling
    // region. The board scrolls horizontally inside it rather than the page.
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold tracking-tight">Pipeline</h1>
          <span className="text-muted-foreground text-xs tabular-nums">
            {total}
          </span>
        </div>
        <AddToPipelineDialog candidates={candidates} />
      </header>

      <div className="min-h-0 flex-1 p-4">
        <PipelineBoard columns={columns} />
      </div>
    </div>
  );
}
