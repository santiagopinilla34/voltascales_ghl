"use server";

import { revalidatePath } from "next/cache";

import { dispatchStageChanged } from "@/lib/automations/dispatch";
import { UNIQUE_VIOLATION } from "@/lib/contacts";
import { isPipelineStage } from "@/lib/pipeline-stages";
import { createClient } from "@/lib/supabase/server";
import type { PipelineStage } from "@/types/database";

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? supabase : null;
}

/** Puts a contact on the board. New cards land in the first stage. */
export async function addToPipeline(
  contactId: string,
  stage: PipelineStage = "interested",
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  if (!isPipelineStage(stage)) {
    return { ok: false, error: `"${stage}" is not a pipeline stage` };
  }

  const { data: entry, error } = await supabase
    .from("pipeline_entries")
    .insert({ contact_id: contactId, stage })
    .select("contact:contacts(*)")
    .single();

  if (error) {
    // The picker filters out contacts already on the board, so this is a stale
    // dialog rather than a mistake worth a raw Postgres message.
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "That contact is already on the pipeline." };
    }
    return { ok: false, error: error.message };
  }

  // Joining the board is a stage change from nowhere.
  if (entry?.contact) {
    await dispatchStageChanged(supabase, entry.contact, stage, null);
  }

  revalidatePath("/pipeline");
  return { ok: true, value: null };
}

/**
 * Moves a card to another stage.
 *
 * `stage_changed_at` is set here rather than defaulted in the database, because
 * it means "entered this stage" — an update that left it alone would keep a
 * card sorted by when it entered a stage it has since left.
 */
export async function movePipelineEntry(
  entryId: string,
  stage: PipelineStage,
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  if (!isPipelineStage(stage)) {
    return { ok: false, error: `"${stage}" is not a pipeline stage` };
  }

  // The stage it is leaving, for the automation event and for the no-op check
  // — dragging a card back into the column it came from is not a move.
  const { data: before } = await supabase
    .from("pipeline_entries")
    .select("stage")
    .eq("id", entryId)
    .maybeSingle();

  const { data: after, error } = await supabase
    .from("pipeline_entries")
    .update({ stage, stage_changed_at: new Date().toISOString() })
    .eq("id", entryId)
    .select("contact:contacts(*)")
    .single();

  if (error) return { ok: false, error: error.message };

  if (after?.contact) {
    await dispatchStageChanged(
      supabase,
      after.contact,
      stage,
      (before?.stage as PipelineStage | undefined) ?? null,
    );
  }

  revalidatePath("/pipeline");
  return { ok: true, value: null };
}

/**
 * Takes a contact off the board.
 *
 * Deletes the entry only. The contact, its messages and its call history are
 * untouched — leaving the pipeline is a statement about this board, not about
 * whether someone is still a contact.
 */
export async function removeFromPipeline(
  entryId: string,
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("pipeline_entries")
    .delete()
    .eq("id", entryId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/pipeline");
  return { ok: true, value: null };
}
