import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, StageColor, StageColorMode } from "@/types/database";

export type PipelineStageSummary = {
  id: string;
  name: string;
  color: StageColor;
  position: number;
  showInFunnel: boolean;
  showInPie: boolean;
};

export type PipelineSummary = {
  id: string;
  name: string;
  colorMode: StageColorMode;
  updatedAt: string;
  createdAt: string;
  /** In board order. The list shows the count; the editor shows the rows. */
  stages: PipelineStageSummary[];
};

/**
 * Every pipeline with its stages, most recently touched first.
 *
 * One query with an embed rather than a count aggregate, because the list
 * needs the number and the editor needs the rows, and fetching the rows once
 * saves the second round trip the moment someone opens one. A pipeline here
 * has at most a handful of stages; this is smaller than the board it sits next
 * to.
 *
 * `updated_at` is restamped by a trigger when a *stage* changes too, so the
 * order this returns reflects renaming a column, not only renaming a pipeline.
 */
export async function listPipelines(
  supabase: SupabaseClient<Database>,
): Promise<PipelineSummary[]> {
  const { data, error } = await supabase
    .from("pipelines")
    .select(
      `id, name, stage_color_mode, updated_at, created_at,
       pipeline_stages ( id, name, color, position, show_in_funnel, show_in_pie )`,
    )
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load pipelines: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    colorMode: row.stage_color_mode,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    // Ordered here rather than in the query: PostgREST cannot order an embed
    // and the caller's board order is not negotiable.
    stages: (row.pipeline_stages ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((stage) => ({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        position: stage.position,
        showInFunnel: stage.show_in_funnel,
        showInPie: stage.show_in_pie,
      })),
  }));
}

/**
 * Every distinct stage name in the organization, in board order, deduplicated.
 *
 * For the automations editor, which names a stage as a string rather than
 * pointing at one: a rule saying "Closed" means whichever pipeline the contact
 * turns out to be on. Two pipelines that both have a "Closed" column are one
 * entry here, because picking it twice would be picking the same rule.
 */
export async function listStageNames(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("name, position")
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Failed to load stages: ${error.message}`);
  }

  const seen = new Set<string>();
  const names: string[] = [];

  for (const row of data ?? []) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(row.name);
  }

  return names;
}

/**
 * The pipeline a board opens on when nothing names one.
 *
 * The oldest, not the first in the list — the list is ordered by when each was
 * last touched, so `[0]` would move the moment somebody renamed a stage on
 * another one. It also has to agree with the fallback in `set_pipeline_stage`
 * and in the booking flow, both of which put a contact on the organization's
 * first-created pipeline: if this picked differently, a contact placed by a
 * rule would land on a board that does not open by default, and would look
 * like it had vanished.
 */
export function primaryPipeline(
  pipelines: PipelineSummary[],
): PipelineSummary | null {
  return (
    pipelines.reduce<PipelineSummary | null>(
      (oldest, entry) =>
        !oldest || entry.createdAt < oldest.createdAt ? entry : oldest,
      null,
    ) ?? null
  );
}
