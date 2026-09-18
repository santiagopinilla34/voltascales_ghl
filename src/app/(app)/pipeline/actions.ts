"use server";

import { revalidatePath } from "next/cache";

import { dispatchStageChanged } from "@/lib/automations/dispatch";
import { UNIQUE_VIOLATION } from "@/lib/contacts";
import { requireOrgContext } from "@/lib/orgs/context";
import { isStageColor, isStageColorMode } from "@/lib/pipeline-colors";
import { createClient } from "@/lib/supabase/server";
import type { StageColor, StageColorMode } from "@/types/database";

export type ActionResult<T = null> =
  { ok: true; value: T } | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? supabase : null;
}

/**
 * Postgres rejecting a stage that is not a column of that pipeline.
 *
 * The composite foreign key onto `(pipeline_id, name)` is what validates a
 * stage now, so there is no list in TypeScript to check against first — and
 * checking against one would be a second source of truth that goes stale the
 * moment someone renames a column.
 */
const FOREIGN_KEY_VIOLATION = "23503";

function unknownStageError(stage: string): string {
  return `"${stage}" is not a stage on this pipeline. It may have been renamed or removed — reload the board.`;
}

/**
 * What a deal may be worth, in cents.
 *
 * The board and the dialog both take it from a text box, so it arrives as
 * whatever someone typed. Rejecting rather than clamping: a value that silently
 * becomes something else is worse than one the field refuses, and the only way
 * to get here is past a control that already accepts digits alone.
 *
 * `MAX_VALUE_CENTS` is the `integer` column's ceiling, not a view about how big
 * a deal can be — a number above it is a typo, and Postgres would answer with
 * "out of range for type integer", which explains nothing to anyone.
 */
const MAX_VALUE_CENTS = 2_147_483_647;

function parseValueCents(value: number): ActionResult<number> {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, error: "That value is not a number." };
  }
  if (value < 0) {
    return { ok: false, error: "A deal cannot be worth less than nothing." };
  }
  if (value > MAX_VALUE_CENTS) {
    return { ok: false, error: "That value is too large." };
  }
  return { ok: true, value };
}

/** Puts a contact on a pipeline, in the stage the caller names. */
export async function addToPipeline(
  contactId: string,
  pipelineId: string,
  stage: string,
  valueCents = 0,
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };
  const context = await requireOrgContext();

  const parsed = parseValueCents(valueCents);
  if (!parsed.ok) return parsed;

  const { data: entry, error } = await supabase
    .from("pipeline_entries")
    .insert({
      org_id: context.orgId,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage,
      value_cents: parsed.value,
    })
    .select("contact:contacts(*)")
    .single();

  if (error) {
    // The picker filters out contacts already on *this* board, so this is a
    // stale dialog rather than a mistake worth a raw Postgres message. It says
    // "this pipeline" and not "a pipeline" because since 20260918010000 the
    // other boards are none of this one's business.
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "That contact is already on this pipeline." };
    }
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { ok: false, error: unknownStageError(stage) };
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
 * Moves a card to another stage of the pipeline it is already on.
 *
 * `stage_changed_at` is set here rather than defaulted in the database, because
 * it means "entered this stage" — an update that left it alone would keep a
 * card sorted by when it entered a stage it has since left.
 *
 * Moving between *pipelines* is deliberately not this function. A card carries
 * its history in `stage_changed_at` and its automations fire on stage changes;
 * dropping it into a foreign set of columns is a different act, and no screen
 * offers it yet.
 */
export async function movePipelineEntry(
  entryId: string,
  stage: string,
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  // The stage it is leaving, for the automation event and for the no-op check
  // — dragging a card back into the column it came from is not a move.
  const { data: before } = await supabase
    .from("pipeline_entries")
    .select("stage")
    .eq("id", entryId)
    .maybeSingle();

  if (before?.stage === stage) return { ok: true, value: null };

  const { data: after, error } = await supabase
    .from("pipeline_entries")
    .update({ stage, stage_changed_at: new Date().toISOString() })
    .eq("id", entryId)
    .select("contact:contacts(*)")
    .single();

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { ok: false, error: unknownStageError(stage) };
    }
    return { ok: false, error: error.message };
  }

  if (after?.contact) {
    await dispatchStageChanged(
      supabase,
      after.contact,
      stage,
      before?.stage ?? null,
    );
  }

  revalidatePath("/pipeline");
  return { ok: true, value: null };
}

/**
 * Sets what a deal is worth.
 *
 * Deliberately not a stage change: `stage_changed_at` stays where it was, and
 * no automation fires. Correcting a figure is not the card moving, and a rule
 * that texted someone because a typo was fixed would be indefensible.
 */
export async function setPipelineEntryValue(
  entryId: string,
  valueCents: number,
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const parsed = parseValueCents(valueCents);
  if (!parsed.ok) return parsed;

  // `.select().single()` rather than a bare update, for the same reason
  // `movePipelineEntry` does it: an update that matches no row is not an error
  // in PostgREST. A card belonging to another organization, or one deleted
  // while this board was open, would otherwise report a value saved that was
  // never written anywhere.
  const { error } = await supabase
    .from("pipeline_entries")
    .update({ value_cents: parsed.value })
    .eq("id", entryId)
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: "That card is no longer on this board — reload and try again.",
    };
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

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------
//
// The Pipelines tab writes here. Everything above this line is about the board
// — where one contact sits — and everything below is about the shape of the
// board itself.
//
// Organization is taken from `requireOrgContext()` and written explicitly
// rather than left to a column default, for the reason the calendar actions
// spell out: with a session the default returns the caller's own membership,
// which for a platform admin is the agency even while they are looking at a
// client. A client's pipeline would be created under the agency.

const MAX_PIPELINE_NAME = 100;
const MAX_STAGE_NAME = 60;

/**
 * No constraint in the database enforces this. It is here because a pipeline
 * with two hundred columns is a mistake or an abusive POST, not a workflow,
 * and the board would be unreadable either way.
 */
const MAX_STAGES = 30;

export type PipelineStageInput = {
  /**
   * Set for a stage that already exists, absent for one just added in the
   * editor. This is what makes editing a diff rather than a replacement — and
   * with cards standing in these columns, a replacement is no longer legal.
   */
  id?: string;
  name: string;
  color: string;
  showInFunnel: boolean;
  showInPie: boolean;
};

export type PipelineInput = {
  name: string;
  colorMode: string;
  stages: PipelineStageInput[];
};

type CleanStage = {
  id?: string;
  name: string;
  color: StageColor;
  showInFunnel: boolean;
  showInPie: boolean;
};

/**
 * Validated exactly as the check constraints are, and for the same reason the
 * contact actions re-validate: a Server Action is a public endpoint, so what
 * the dialog allows is not a constraint on what arrives here.
 *
 * Duplicate stage names are rejected before the insert rather than left to
 * `pipeline_stages_pipeline_name_idx`, because a unique violation arriving
 * from a seven-row insert cannot say which row caused it.
 */
function cleanInput(input: PipelineInput): ActionResult<{
  name: string;
  colorMode: StageColorMode;
  stages: CleanStage[];
}> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the pipeline a name." };
  if (name.length > MAX_PIPELINE_NAME) {
    return { ok: false, error: "That pipeline name is too long." };
  }

  if (!isStageColorMode(input.colorMode)) {
    return { ok: false, error: `"${input.colorMode}" is not a colour mode.` };
  }

  if (input.stages.length === 0) {
    return { ok: false, error: "A pipeline needs at least one stage." };
  }
  if (input.stages.length > MAX_STAGES) {
    return {
      ok: false,
      error: `A pipeline can have at most ${MAX_STAGES} stages.`,
    };
  }

  const seen = new Set<string>();
  const stages: CleanStage[] = [];

  for (const raw of input.stages) {
    const stageName = raw.name.trim();
    if (!stageName) return { ok: false, error: "Every stage needs a name." };
    if (stageName.length > MAX_STAGE_NAME) {
      return {
        ok: false,
        error: `"${stageName}" is too long for a stage name.`,
      };
    }

    const key = stageName.toLowerCase();
    if (seen.has(key)) {
      return {
        ok: false,
        error: `There are two stages called "${stageName}".`,
      };
    }
    seen.add(key);

    if (!isStageColor(raw.color)) {
      return { ok: false, error: `"${raw.color}" is not a stage colour.` };
    }

    stages.push({
      id: raw.id,
      name: stageName,
      color: raw.color,
      showInFunnel: raw.showInFunnel,
      showInPie: raw.showInPie,
    });
  }

  return { ok: true, value: { name, colorMode: input.colorMode, stages } };
}

function duplicateNameError(name: string): string {
  return `You already have a pipeline called "${name}".`;
}

/**
 * Creates a pipeline and its stages.
 *
 * Two statements, because PostgREST has no transaction to put them in. The
 * pipeline is removed again if the stages fail, since a pipeline with no
 * stages is not a thing the rest of the app can render — and leaving one
 * behind would also take the name, so the retry would collide with the wreck
 * of the first attempt.
 */
export async function createPipeline(
  input: PipelineInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };
  const context = await requireOrgContext();

  const clean = cleanInput(input);
  if (!clean.ok) return clean;
  const { name, colorMode, stages } = clean.value;

  const { data: pipeline, error } = await supabase
    .from("pipelines")
    .insert({ org_id: context.orgId, name, stage_color_mode: colorMode })
    .select("id")
    .single();

  if (error || !pipeline) {
    if (error?.code === UNIQUE_VIOLATION) {
      return { ok: false, error: duplicateNameError(name) };
    }
    return {
      ok: false,
      error: error?.message ?? "Could not create the pipeline.",
    };
  }

  const { error: stagesError } = await supabase.from("pipeline_stages").insert(
    stages.map((stage, index) => ({
      org_id: context.orgId,
      pipeline_id: pipeline.id,
      name: stage.name,
      color: stage.color,
      position: index,
      show_in_funnel: stage.showInFunnel,
      show_in_pie: stage.showInPie,
    })),
  );

  if (stagesError) {
    await supabase.from("pipelines").delete().eq("id", pipeline.id);
    return { ok: false, error: stagesError.message };
  }

  revalidatePath("/pipeline");
  return { ok: true, value: { id: pipeline.id } };
}

/**
 * Applies a pipeline's edits: its name, its colour mode, and the stages.
 *
 * A diff rather than the delete-and-reinsert this used to be. Cards now stand
 * in these columns through a composite foreign key, so reinserting every stage
 * would mean deleting columns that are occupied — which the `on delete restrict`
 * refuses, and which would be data loss if it did not.
 *
 * What each part of the diff costs is worth knowing:
 *
 * * **Renaming** a stage is free. The foreign key is `on update cascade`, so
 *   every card standing in that column follows the new name in the same
 *   statement, with nothing here to write.
 * * **Removing** a stage that still holds cards fails, and is reported as such.
 *   Emptying the column first is a decision for whoever owns those deals.
 * * **Swapping two stages' names** in one save can trip the unique constraint
 *   partway through, because these go out as separate statements and PostgREST
 *   has no transaction to hold them in. Rare enough to report rather than
 *   solve with a two-phase rename that doubles every save.
 */
export async function updatePipeline(
  pipelineId: string,
  input: PipelineInput,
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };
  const context = await requireOrgContext();

  const clean = cleanInput(input);
  if (!clean.ok) return clean;
  const { name, colorMode, stages } = clean.value;

  // Selected back so that matching nothing is an error rather than a silent
  // success: RLS is a filter, so a pipeline belonging to another organization
  // updates zero rows and reports no error at all.
  const { data: updated, error } = await supabase
    .from("pipelines")
    .update({ name, stage_color_mode: colorMode })
    .eq("id", pipelineId)
    .select("id");

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: duplicateNameError(name) };
    }
    return { ok: false, error: error.message };
  }

  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "That pipeline no longer exists, or is not yours to edit.",
    };
  }

  const { data: existing, error: readError } = await supabase
    .from("pipeline_stages")
    .select("id, name")
    .eq("pipeline_id", pipelineId);

  if (readError) return { ok: false, error: readError.message };

  const kept = new Set(
    stages.map((stage) => stage.id).filter((id): id is string => Boolean(id)),
  );
  const removed = (existing ?? []).filter((row) => !kept.has(row.id));

  if (removed.length > 0) {
    const { error: deleteError } = await supabase
      .from("pipeline_stages")
      .delete()
      .in(
        "id",
        removed.map((row) => row.id),
      );

    if (deleteError) {
      if (deleteError.code === FOREIGN_KEY_VIOLATION) {
        const names = removed.map((row) => `"${row.name}"`).join(", ");
        return {
          ok: false,
          error: `${names} still has deals in it. Move them to another stage before removing it.`,
        };
      }
      return { ok: false, error: deleteError.message };
    }
  }

  // Positions come from the order they arrived in, which is the order the
  // editor showed — dragging a row is what changes this.
  for (const [index, stage] of stages.entries()) {
    const row = {
      name: stage.name,
      color: stage.color,
      position: index,
      show_in_funnel: stage.showInFunnel,
      show_in_pie: stage.showInPie,
    };

    const { error: writeError } = stage.id
      ? await supabase
          .from("pipeline_stages")
          .update(row)
          .eq("id", stage.id)
          .eq("pipeline_id", pipelineId)
      : await supabase.from("pipeline_stages").insert({
          ...row,
          org_id: context.orgId,
          pipeline_id: pipelineId,
        });

    if (writeError) {
      if (writeError.code === UNIQUE_VIOLATION) {
        return {
          ok: false,
          error: `Could not finish renaming to "${stage.name}" — another stage is still using that name. Rename them one at a time.`,
        };
      }
      return { ok: false, error: writeError.message };
    }
  }

  revalidatePath("/pipeline");
  return { ok: true, value: null };
}

/**
 * Copies a pipeline and its stages under a free name.
 *
 * The suffix counts up rather than being "(copy)" flatly, because duplicating
 * twice is the normal way to build three similar pipelines and the second
 * attempt would otherwise collide with the first.
 */
export async function duplicatePipeline(
  pipelineId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };
  const context = await requireOrgContext();

  const { data: source, error: readError } = await supabase
    .from("pipelines")
    .select(
      `name, stage_color_mode,
       pipeline_stages ( name, color, position, show_in_funnel, show_in_pie )`,
    )
    .eq("id", pipelineId)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!source) return { ok: false, error: "That pipeline no longer exists." };

  const { data: existing } = await supabase.from("pipelines").select("name");
  const taken = new Set(
    (existing ?? []).map((row) => row.name.trim().toLowerCase()),
  );

  let name = `${source.name} (copy)`;
  for (let n = 2; taken.has(name.toLowerCase()) && n < 100; n += 1) {
    name = `${source.name} (copy ${n})`;
  }
  if (name.length > MAX_PIPELINE_NAME) {
    return { ok: false, error: "That pipeline's name is too long to copy." };
  }

  const { data: copy, error } = await supabase
    .from("pipelines")
    .insert({
      org_id: context.orgId,
      name,
      stage_color_mode: source.stage_color_mode,
    })
    .select("id")
    .single();

  if (error || !copy) {
    if (error?.code === UNIQUE_VIOLATION) {
      return { ok: false, error: duplicateNameError(name) };
    }
    return {
      ok: false,
      error: error?.message ?? "Could not copy the pipeline.",
    };
  }

  const stages = (source.pipeline_stages ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);

  if (stages.length > 0) {
    const { error: stagesError } = await supabase
      .from("pipeline_stages")
      .insert(
        stages.map((stage, index) => ({
          org_id: context.orgId,
          pipeline_id: copy.id,
          name: stage.name,
          color: stage.color,
          position: index,
          show_in_funnel: stage.show_in_funnel,
          show_in_pie: stage.show_in_pie,
        })),
      );

    if (stagesError) {
      await supabase.from("pipelines").delete().eq("id", copy.id);
      return { ok: false, error: stagesError.message };
    }
  }

  revalidatePath("/pipeline");
  return { ok: true, value: { id: copy.id } };
}

/**
 * Removes a pipeline. Its stages cascade.
 *
 * No card moves and no contact is touched: the board runs on
 * `pipeline_entries.stage`, which does not point here yet. When it does, this
 * needs to decide what happens to the cards standing in a deleted pipeline's
 * columns — and refusing to delete a pipeline that still has any is the
 * answer that cannot lose someone's work.
 */
export async function deletePipeline(
  pipelineId: string,
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("pipelines")
    .delete()
    .eq("id", pipelineId)
    .select("id");

  if (error) return { ok: false, error: error.message };

  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "That pipeline no longer exists, or is not yours to delete.",
    };
  }

  revalidatePath("/pipeline");
  return { ok: true, value: null };
}
