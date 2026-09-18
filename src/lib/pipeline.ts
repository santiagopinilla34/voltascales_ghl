import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Contact, Database } from "@/types/database";

export type PipelineCard = {
  entryId: string;
  /**
   * The stage's *name*, which is what `pipeline_entries` stores — a composite
   * foreign key onto `(pipeline_id, name)`. Renaming a stage cascades here, so
   * this can be compared directly against a column's name without a lookup.
   */
  stage: string;
  stageChangedAt: string;
  /**
   * What this deal is worth, in cents.
   *
   * The entry's own number, typed on the card. It used to be derived — the sum
   * of every invoice raised against the contact — which read as a forecast and
   * was not one: an invoice exists at or after the close, so every column
   * before it was structurally zero, and the figure travelled from column to
   * column with the card instead of belonging to any of them.
   */
  valueCents: number;
  contact: Pick<
    Contact,
    "id" | "name" | "phone" | "business_name" | "status" | "tags"
  >;
};

/**
 * One pipeline's cards, most recently moved first.
 *
 * Scoped to a pipeline rather than returning the board's whole contents: a
 * card belongs to exactly one pipeline now, and the page renders one at a
 * time. Fetching them all would mean shipping every other pipeline's cards to
 * the browser to be filtered out of view.
 *
 * Flat rather than pre-grouped: the board can group by stage or by status, and
 * only one of those is the shape the database stores. Grouping is a view of
 * this list, so it belongs where the view is.
 */
export async function listPipeline(
  supabase: SupabaseClient<Database>,
  pipelineId: string,
): Promise<PipelineCard[]> {
  // One query now. The value used to need a second, over the whole invoices
  // table, to derive a figure this column already holds.
  const { data, error } = await supabase
    .from("pipeline_entries")
    .select(
      `id, stage, stage_changed_at, value_cents,
       contacts ( id, name, phone, business_name, status, tags )`,
    )
    .eq("pipeline_id", pipelineId)
    .order("stage_changed_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load the pipeline: ${error.message}`);
  }

  const cards: PipelineCard[] = [];

  for (const row of data ?? []) {
    // The embed is typed as possibly-null because the FK is nullable in
    // general; here it can't be, since the column is `not null` and cascades.
    if (!row.contacts) continue;

    cards.push({
      entryId: row.id,
      stage: row.stage,
      stageChangedAt: row.stage_changed_at,
      valueCents: row.value_cents,
      contact: row.contacts,
    });
  }

  return cards;
}

/**
 * Contacts not on *this* pipeline, for the "add to pipeline" picker.
 *
 * Scoped to one board, which is the whole point of 20260918010000. It used to
 * exclude anyone standing on any pipeline at all, because `contact_id` was
 * globally unique and offering them would have offered an insert that could
 * only fail. That also silently made the second pipeline useless: a customer in
 * Sales was missing from Onboarding's picker with nothing to say why.
 *
 * Uniqueness is now per contact per pipeline, so the only people who cannot be
 * added here are the ones already on this board.
 */
export async function listContactsNotOnPipeline(
  supabase: SupabaseClient<Database>,
  pipelineId: string,
): Promise<Pick<Contact, "id" | "name" | "phone" | "business_name">[]> {
  const { data: entries, error: entriesError } = await supabase
    .from("pipeline_entries")
    .select("contact_id")
    .eq("pipeline_id", pipelineId);

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
