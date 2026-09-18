import type { Metadata } from "next";

import { OpportunitiesTabs } from "@/components/pipeline/opportunities-tabs";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { listContactsNotOnPipeline, listPipeline } from "@/lib/pipeline";
import { listPipelines, primaryPipeline } from "@/lib/pipelines";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Opportunities · VoltaScales" };

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ pipeline?: string }>;
}) {
  const supabase = await createClient();

  // Sequential, unlike the rest: which pipeline is showing decides which cards
  // to fetch, so the card query cannot start until this one has answered.
  const [pipelines, { pipeline: requested }] = await Promise.all([
    listPipelines(supabase),
    searchParams,
  ]);

  // A `?pipeline=` naming something that was deleted, or belongs to another
  // organization and so never came back from the query, falls to the first
  // rather than erroring. A stale link is not worth a broken page.
  const selected =
    pipelines.find((entry) => entry.id === requested) ??
    primaryPipeline(pipelines);

  // Both scoped to the pipeline on screen: its cards, and the contacts who are
  // not among them. A contact on another board is a valid thing to add here —
  // being in Sales does not disqualify someone from Onboarding.
  const [cards, candidates] = await Promise.all([
    selected ? listPipeline(supabase, selected.id) : Promise.resolve([]),
    selected
      ? listContactsNotOnPipeline(supabase, selected.id)
      : Promise.resolve([]),
  ]);

  return (
    // Same shape as the Contacts page: a fixed header over a single scrolling
    // region. The board scrolls horizontally inside it rather than the page.
    //
    // The header carries the title and the two tabs, and nothing else.
    // Everything that acts on the board — choosing its pipeline, searching it,
    // filtering it, adding to it — sits in the board's own toolbar, within
    // reach of the thing it changes.
    //
    // The board is built here and handed down: the tabs are client state, and
    // passing the element keeps this page a Server Component that can still
    // await its own queries.
    <div className="flex min-h-0 flex-1 flex-col">
      <OpportunitiesTabs
        count={cards.length}
        pipelines={pipelines}
        board={
          selected ? (
            <PipelineBoard
              cards={cards}
              candidates={candidates}
              pipelines={pipelines}
              pipeline={selected}
            />
          ) : (
            // Only reachable if every pipeline has been deleted. The seed gives
            // each organization one, so this is the state someone has to work
            // to reach — and the Pipelines tab beside it is where they undo it.
            <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm">
              There are no pipelines yet. Create one on the Pipelines tab and
              the board will show it here.
            </div>
          )
        }
      />
    </div>
  );
}
