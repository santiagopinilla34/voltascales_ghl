"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/ai-agents/knowledge-base/actions";
import { countFaqs } from "@/lib/knowledge/faq-queries";
import {
  ANSWER_MAX,
  FAQ_LIMIT,
  QUESTION_MAX,
  normalizeQuestion,
} from "@/lib/knowledge/faqs";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";

/**
 * Writing question-and-answer pairs.
 *
 * Short, compared with the crawler's actions, and that is the point of the
 * source: there is no discovery step, no fetch and nothing to resume. What
 * somebody types is what an agent answers from, so these are three writes and
 * the validation in front of them.
 *
 * Only the insert names an organization. Every update and delete leaves it to
 * RLS, whose policies resolve the organization from the session -- so a FAQ id
 * belonging to another tenant matches nothing here rather than being caught by
 * a check.
 */

const PATH = "/ai-agents/knowledge-base";

/** Revalidates the whole base, since a FAQ changes the tab and the count. */
function refresh() {
  revalidatePath(PATH, "layout");
}

/**
 * Turns the unique-index violation into a sentence.
 *
 * The one error a person will actually hit -- they answered this last month
 * and forgot -- and Postgres's own wording for it names the index rather than
 * the problem.
 */
function describe(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "That question is already on this knowledge base.";
  }
  return error.message;
}

/**
 * A pair, cleaned up and checked.
 *
 * Shared by create and edit so a FAQ cannot be edited into something it could
 * not have been created as. The question has its whitespace collapsed as well
 * as trimmed: "What are your   hours?" and "What are your hours?" are the same
 * question, and the unique index below only catches that if the app agrees.
 */
function validate(
  question: string,
  answer: string,
): ActionResult<{ question: string; answer: string }> {
  const trimmedQuestion = normalizeQuestion(question);

  if (!trimmedQuestion) {
    return { ok: false, error: "Write the question somebody would ask." };
  }

  if (trimmedQuestion.length > QUESTION_MAX) {
    return {
      ok: false,
      error: `Questions are limited to ${QUESTION_MAX.toLocaleString()} characters.`,
    };
  }

  const trimmedAnswer = answer.trim();

  if (!trimmedAnswer) {
    return { ok: false, error: "Write the answer the agent should give." };
  }

  if (trimmedAnswer.length > ANSWER_MAX) {
    return {
      ok: false,
      error: `Answers are limited to ${ANSWER_MAX.toLocaleString()} characters.`,
    };
  }

  return { ok: true, value: { question: trimmedQuestion, answer: trimmedAnswer } };
}

export async function createFaq(
  baseId: string,
  input: { question: string; answer: string },
): Promise<ActionResult<{ id: string }>> {
  const valid = validate(input.question, input.answer);
  if (!valid.ok) return valid;

  const context = await requireOrgContext();
  const supabase = await createClient();

  // Counted here rather than taken from the browser, for the reason the
  // crawler counts its pages: the screen knows how many there were when the
  // dialog opened, which is not the same as how many there are now.
  const used = await countFaqs(supabase, baseId);

  if (used >= FAQ_LIMIT) {
    return {
      ok: false,
      error: `This knowledge base is at its limit of ${FAQ_LIMIT} questions. Delete some to make room.`,
    };
  }

  const { data, error } = await supabase
    .from("knowledge_faqs")
    .insert({
      org_id: context.orgId,
      base_id: baseId,
      question: valid.value.question,
      answer: valid.value.answer,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: describe(error) };

  refresh();
  return { ok: true, value: { id: data.id } };
}

export async function updateFaq(
  faqId: string,
  input: { question: string; answer: string },
): Promise<ActionResult> {
  const valid = validate(input.question, input.answer);
  if (!valid.ok) return valid;

  const supabase = await createClient();

  const { error } = await supabase
    .from("knowledge_faqs")
    .update({
      question: valid.value.question,
      answer: valid.value.answer,
      updated_at: new Date().toISOString(),
    })
    .eq("id", faqId);

  if (error) return { ok: false, error: describe(error) };

  refresh();
  return { ok: true, value: null };
}

export async function deleteFaq(faqId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("knowledge_faqs")
    .delete()
    .eq("id", faqId);

  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true, value: null };
}

/**
 * Removes several at once, which is what the row checkboxes are for.
 *
 * One statement rather than a loop, unlike the crawler's bulk delete -- that
 * one had to go a row at a time because each delete also adjusts its source's
 * counters and two of those racing corrupts the progress bar. A FAQ has no
 * counters to keep in step, so there is nothing to serialise and one round
 * trip will do.
 */
export async function deleteFaqs(faqIds: string[]): Promise<ActionResult> {
  if (faqIds.length === 0) return { ok: true, value: null };

  const supabase = await createClient();

  const { error } = await supabase
    .from("knowledge_faqs")
    .delete()
    .in("id", faqIds);

  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true, value: null };
}
