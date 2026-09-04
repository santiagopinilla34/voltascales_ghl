import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Contact, Database, PipelineStage } from "@/types/database";

export type PipelineCard = {
  entryId: string;
  stage: PipelineStage;
  stageChangedAt: string;
  /**
   * What this card is worth, in cents: everything invoiced to the contact.
   *
   * Derived rather than stored, because a deal value someone types into a card
   * is a guess that goes stale the moment an invoice is raised — the invoices
   * are the number the business already agreed on. A contact with none is a
   * real zero, not missing data.
   */
  valueCents: number;
  contact: Pick<
    Contact,
    "id" | "name" | "phone" | "business_name" | "status" | "tags"
  >;
};

/**
 * Every card on the board, most recently moved first.
 *
 * Flat rather than pre-grouped: the board can group by stage or by status, and
 * only one of those is the shape the database stores. Grouping is a view of
 * this list, so it belongs where the view is.
 */
export async function listPipeline(
  supabase: SupabaseClient<Database>,
): Promise<PipelineCard[]> {
  const [entries, invoices] = await Promise.all([
    supabase
      .from("pipeline_entries")
      .select(
        `id, stage, stage_changed_at,
         contacts ( id, name, phone, business_name, status, tags )`,
      )
      .order("stage_changed_at", { ascending: false }),
    // Every invoice, not one query per card: the board is small and this is one
    // round trip instead of N.
    supabase.from("invoices").select("contact_id, total_cents"),
  ]);

  if (entries.error) {
    throw new Error(`Failed to load the pipeline: ${entries.error.message}`);
  }
  if (invoices.error) {
    throw new Error(`Failed to load deal values: ${invoices.error.message}`);
  }

  const valueByContact = new Map<string, number>();

  for (const invoice of invoices.data ?? []) {
    if (!invoice.contact_id) continue;
    valueByContact.set(
      invoice.contact_id,
      (valueByContact.get(invoice.contact_id) ?? 0) + invoice.total_cents,
    );
  }

  const cards: PipelineCard[] = [];

  for (const row of entries.data ?? []) {
    // The embed is typed as possibly-null because the FK is nullable in
    // general; here it can't be, since the column is `not null` and cascades.
    if (!row.contacts) continue;

    cards.push({
      entryId: row.id,
      stage: row.stage,
      stageChangedAt: row.stage_changed_at,
      valueCents: valueByContact.get(row.contacts.id) ?? 0,
      contact: row.contacts,
    });
  }

  return cards;
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
