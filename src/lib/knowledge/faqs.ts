/**
 * FAQ: the rules about a question-and-answer pair.
 *
 * Client-safe -- no `server-only` -- because the Add FAQ dialog runs in the
 * browser and draws the character counters from these numbers. Reading from
 * Postgres lives in `faq-queries.ts`, which is server-only; nothing in this
 * file touches the database.
 */

/**
 * The longest a question may be, and the longest an answer.
 *
 * One number for both, shown as a counter under each field. They could
 * plausibly differ -- questions are short and answers are not -- but the
 * screen puts the same control under both boxes, and two different ceilings
 * there is a rule somebody discovers by hitting it.
 *
 * A thousand is long enough for a real answer with a caveat in it and short
 * enough that a pasted page of terms is refused rather than quietly becoming
 * one of the facts an agent leans on. That is the failure worth preventing:
 * the field is there to hold the sentence you already say on the phone.
 *
 * Mirrors `knowledge_faqs_question_length` and `knowledge_faqs_answer_length`.
 */
export const QUESTION_MAX = 1000;
export const ANSWER_MAX = 1000;

/**
 * How many questions one base may hold.
 *
 * The same argument as the crawler's page limit, and it is worth repeating
 * because the cost is invisible at the moment somebody pays it: a knowledge
 * base is handed to an agent as context on *every reply*, so a pair written
 * once is paid for over and over for as long as it stays in the base. Two
 * hundred well-chosen questions is a better agent than a thousand, and a
 * cheaper one.
 *
 * Enforced in the action rather than by a constraint, for the reason the base
 * limit is: a check counting rows in its own table needs a trigger, and what
 * that produces is a Postgres error rather than a sentence saying what to do.
 */
export const FAQ_LIMIT = 200;

/** Whitespace collapsed, so search and the taken-question check agree. */
export function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ");
}
