import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Contact, Database, PipelineStage } from "@/types/database";

import { PIPELINE_STAGES } from "./pipeline-stages";

export type PipelineCard = {
  entryId: string;
  stage: PipelineStage;
  stageChangedAt: string;
  contact: Pick<
    Contact,
    "id" | "name" | "phone" | "business_name" | "status" | "tags"
  >;
};

/** Every stage, in board order, with the cards sitting in it. */
export type PipelineColumn = {
  stage: PipelineStage;
  label: string;
  cards: PipelineCard[];
};

/**
 * The whole board in one round trip.
 *
 * Every stage is returned whether or not it has cards — an empty column is a
 * place to drop something, so the board can't be built from the rows alone.
 */
export async function listPipeline(
  supabase: SupabaseClient<Database>,
): Promise<PipelineColumn[]> {
  const { data, error } = await supabase
    .from("pipeline_entries")
    .select(
      `id, stage, stage_changed_at,
       contacts ( id, name, phone, business_name, status, tags )`,
    )
    .order("stage_changed_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load the pipeline: ${error.message}`);
  }

  const byStage = new Map<PipelineStage, PipelineCard[]>(
    PIPELINE_STAGES.map((stage) => [stage.value, []]),
  );

  for (const row of data ?? []) {
    // The embed is typed as possibly-null because the FK is nullable in
    // general; here it can't be, since the column is `not null` and cascades.
    if (!row.contacts) continue;

    byStage.get(row.stage)?.push({
      entryId: row.id,
      stage: row.stage,
      stageChangedAt: row.stage_changed_at,
      contact: row.contacts,
    });
  }

  return PIPELINE_STAGES.map((stage) => ({
    stage: stage.value,
    label: stage.label,
    cards: byStage.get(stage.value) ?? [],
  }));
}

/**
 * Contacts not already on the board, for the "add to pipeline" picker.
 *
 * Filtering here rather than in the dialog so the list can't offer someone who
 * would fail the unique constraint on insert.
 */
export async function listContactsNotOnPipeline(
  supabase: SupabaseClient<Database>,
): Promise<Pick<Contact, "id" | "name" | "phone" | "business_name">[]> {
  const { data: entries, error: entriesError } = await supabase
    .from("pipeline_entries")
    .select("contact_id");

  if (entriesError) {
    throw new Error(`Failed to load the pipeline: ${entriesError.message}`);
  }

  const taken = new Set((entries ?? []).map((entry) => entry.contact_id));

  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, phone, business_name")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load contacts: ${error.message}`);
  }

  return (data ?? []).filter((contact) => !taken.has(contact.id));
}
