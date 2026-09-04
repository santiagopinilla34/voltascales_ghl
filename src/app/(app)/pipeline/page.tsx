import type { Metadata } from "next";

import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { listContactsNotOnPipeline, listPipeline } from "@/lib/pipeline";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pipeline · VoltaScales" };

export default async function PipelinePage() {
  const supabase = await createClient();
  const [cards, candidates] = await Promise.all([
    listPipeline(supabase),
    listContactsNotOnPipeline(supabase),
  ]);

  return (
    // Same shape as the Contacts page: a fixed header over a single scrolling
    // region. The board scrolls horizontally inside it rather than the page.
    //
    // The header carries the title and nothing else. Everything that acts on
    // the board — searching it, filtering it, adding to it — sits in the
    // board's own toolbar, within reach of the thing it changes.
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="reserve-topbar flex h-20 shrink-0 items-center gap-2 border-b pl-14 md:pl-4">
        <h1 className="truncate text-sm font-semibold tracking-tight">
          Pipeline
        </h1>
        <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-[11px] leading-4 tabular-nums">
          {cards.length}
        </span>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
        <PipelineBoard cards={cards} candidates={candidates} />
      </div>
    </div>
  );
}
