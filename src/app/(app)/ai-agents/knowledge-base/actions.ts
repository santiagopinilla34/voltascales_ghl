"use server";

import { revalidatePath } from "next/cache";

import {
  DESCRIPTION_MAX,
  KNOWLEDGE_BASE_LIMIT,
  NAME_MAX,
} from "@/lib/knowledge/bases";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";

/**
 * Creating, renaming and deleting knowledge bases.
 *
 * Nothing here filters by organization on a read, and only the insert names
 * one. That is RLS doing its job: the policies on `knowledge_bases` resolve
 * the organization from the session, so an update or a delete aimed at another
 * tenant's row matches nothing rather than being caught by a check in here.
 * The insert is the exception because a new row has no organization until it
 * is given one, and `WITH CHECK` then refuses it if the answer is wrong.
 */

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const PATH = "/ai-agents/knowledge-base";

/**
 * Name and description, cleaned up and checked.
 *
 * Shared by create and rename so a base cannot be renamed to something it
 * could not have been created as.
 */
function validate(
  name: string,
  description: string,
): ActionResult<{ name: string; description: string | null }> {
  const trimmed = name.trim();

  if (!trimmed) {
    return { ok: false, error: "Give the knowledge base a name." };
  }

  if (trimmed.length > NAME_MAX) {
    return {
      ok: false,
      error: `Names are limited to ${NAME_MAX} characters.`,
    };
  }

  const trimmedDescription = description.trim();

  if (trimmedDescription.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Descriptions are limited to ${DESCRIPTION_MAX} characters.`,
    };
  }

  return {
    ok: true,
    // Empty becomes null rather than "": one absent value, so the list has one
    // thing to test for instead of two.
    value: { name: trimmed, description: trimmedDescription || null },
  };
}

/**
 * Turns the unique-index violation into a sentence.
 *
 * Worth special-casing because it is the one error a person will actually hit,
 * and Postgres's own wording for it names the index rather than the problem.
 */
function describe(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "There's already a knowledge base with that name.";
  }
  return error.message;
}

export async function createKnowledgeBase(input: {
  name: string;
  description: string;
}): Promise<ActionResult<{ id: string }>> {
  const valid = validate(input.name, input.description);
  if (!valid.ok) return valid;

  const context = await requireOrgContext();
  const supabase = await createClient();

  // Counted rather than trusted from the page: the button knows how many there
  // were when it rendered, which is not the same as how many there are.
  const { count, error: countError } = await supabase
    .from("knowledge_bases")
    .select("id", { count: "exact", head: true });

  if (countError) {
    return { ok: false, error: countError.message };
  }

  if ((count ?? 0) >= KNOWLEDGE_BASE_LIMIT) {
    return {
      ok: false,
      error: `That's the limit of ${KNOWLEDGE_BASE_LIMIT} knowledge bases. Delete one you no longer use to make room.`,
    };
  }

  const { data, error } = await supabase
    .from("knowledge_bases")
    .insert({
      org_id: context.orgId,
      name: valid.value.name,
      description: valid.value.description,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: describe(error) };

  revalidatePath(PATH);
  return { ok: true, value: { id: data.id } };
}

export async function renameKnowledgeBase(
  id: string,
  input: { name: string; description: string },
): Promise<ActionResult> {
  const valid = validate(input.name, input.description);
  if (!valid.ok) return valid;

  const supabase = await createClient();

  const { error } = await supabase
    .from("knowledge_bases")
    .update({
      name: valid.value.name,
      description: valid.value.description,
      // Set here, not by a trigger — the convention the rest of this schema
      // follows. See `settings` and the phone actions.
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false, error: describe(error) };

  revalidatePath(PATH);
  return { ok: true, value: null };
}

export async function deleteKnowledgeBase(
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("knowledge_bases")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH);
  return { ok: true, value: null };
}
