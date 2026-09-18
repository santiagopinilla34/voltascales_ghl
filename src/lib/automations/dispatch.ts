import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Contact, Database } from "@/types/database";

import { runAutomationsForEvent } from "./engine";

/**
 * Fires the CRM's own triggers: a contact appearing, a tag going on, a status
 * moving, a deal changing stage.
 *
 * ## Why this is not a database trigger
 *
 * The obvious home for this is `create trigger ... on public.contacts`, and it
 * is the wrong one. The engine writes to both of these tables itself —
 * `add_tag`, `set_status`, `set_ai` and `update_field` update `contacts`;
 * `set_pipeline_stage` and `remove_from_pipeline` write `pipeline_entries`. A
 * row-level trigger cannot tell those writes from a human's, so a rule that
 * fires on a tag and adds another would re-enter the engine, add another, and
 * send a real text on every pass.
 *
 * Dispatching from the application makes that loop impossible by construction
 * rather than by guard: **the engine's action executors are the one caller
 * that never calls in here.** If you add an action that writes a contact or a
 * pipeline entry, it must not dispatch either — that rule is the whole design.
 *
 * The honest cost: a row edited straight in the Supabase dashboard fires
 * nothing. Every route the app itself offers is covered.
 *
 * ## Failure is silent
 *
 * A rule that breaks must not break the save that triggered it. Somebody
 * renaming a contact should not see "could not update contact" because an
 * unrelated welcome text failed — the contact *was* updated. The engine writes
 * its own `automation_runs` rows either way, which is where a failure is meant
 * to be visible.
 */

async function fire(
  supabase: SupabaseClient<Database>,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error("[automations] dispatch failed", error);
  }
}

/** A contact row has just been inserted. */
export async function dispatchContactCreated(
  supabase: SupabaseClient<Database>,
  contact: Contact,
): Promise<void> {
  await fire(supabase, () =>
    runAutomationsForEvent(supabase, {
      orgId: contact.org_id,
      trigger: "contact_created",
      contact,
    }),
  );
}

/**
 * A contact row has just been updated. Works out what actually changed.
 *
 * Takes both rows rather than a patch because the edit form sends the whole
 * contact every time: `tags: ["lead", "vip"]` says nothing on its own about
 * whether "vip" is new. Comparing is the only way to know, and the comparison
 * belongs here rather than in each caller.
 *
 * Tags fire one event each, and only for additions. Removing a tag is not a
 * trigger — there is no `contact_tag_removed`, because the rules people write
 * are about somebody becoming something, not ceasing to be it.
 */
export async function dispatchContactChanged(
  supabase: SupabaseClient<Database>,
  before: Contact,
  after: Contact,
): Promise<void> {
  // Case-insensitively, matching how `add_tag` and the tag trigger compare.
  const had = new Set(before.tags.map((tag) => tag.toLowerCase()));
  const added = after.tags.filter((tag) => !had.has(tag.toLowerCase()));

  for (const tag of added) {
    await fire(supabase, () =>
      runAutomationsForEvent(supabase, {
        orgId: after.org_id,
        trigger: "contact_tag_added",
        contact: after,
        tag,
      }),
    );
  }

  if (before.status !== after.status) {
    await fire(supabase, () =>
      runAutomationsForEvent(supabase, {
        orgId: after.org_id,
        trigger: "contact_status_changed",
        contact: after,
        status: after.status,
        previousStatus: before.status,
      }),
    );
  }
}

/**
 * A contact joined the pipeline board, or moved along it.
 *
 * `previousStage` is null for joining. The trigger does not distinguish the
 * two: somebody writing "when a deal reaches Booked, text them" is not
 * thinking about whether the row was inserted or updated to get there.
 */
export async function dispatchStageChanged(
  supabase: SupabaseClient<Database>,
  contact: Contact,
  stage: string,
  previousStage: string | null,
): Promise<void> {
  // Re-saving a card into the column it is already in is not a move.
  if (previousStage === stage) return;

  await fire(supabase, () =>
    runAutomationsForEvent(supabase, {
      orgId: contact.org_id,
      trigger: "opportunity_stage_changed",
      contact,
      stage,
      previousStage,
    }),
  );
}
