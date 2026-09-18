"use client";

import { useState } from "react";

import { PipelinesPanel } from "@/components/pipeline/pipelines-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PipelineSummary } from "@/lib/pipelines";

/**
 * The two views of this page: the board of opportunities, and the list of
 * pipelines those opportunities move through.
 *
 * The board arrives as a prop rather than being imported here so the page can
 * stay a Server Component and keep fetching its own data — a Client Component
 * cannot `await` the queries, but it can be handed the element they produced.
 *
 * Client state rather than a `?tab=` search param on purpose: switching tabs
 * is not a place anyone wants to land from a link, and a param would put a
 * server round trip in front of a toggle whose content is already here.
 */
export function OpportunitiesTabs({
  count,
  pipelines,
  board,
}: {
  count: number;
  pipelines: PipelineSummary[];
  board: React.ReactNode;
}) {
  const [tab, setTab] = useState("opportunities");

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <header className="reserve-topbar flex h-20 shrink-0 items-center gap-4 border-b pl-14 md:pl-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            Opportunities
          </h1>
          <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-[11px] leading-4 tabular-nums">
            {count}
          </span>
        </div>

        <TabsList>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
        </TabsList>
      </header>

      {/* Each pane owns its own scrolling: the board scrolls sideways inside a
          fixed-height shell, the list scrolls down the page. */}
      <TabsContent
        value="opportunities"
        className="flex min-h-0 min-w-0 flex-1 flex-col p-4"
      >
        {board}
      </TabsContent>

      <TabsContent
        value="pipelines"
        className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 sm:px-6 lg:px-10"
      >
        <PipelinesPanel pipelines={pipelines} />
      </TabsContent>
    </Tabs>
  );
}
