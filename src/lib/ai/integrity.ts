/**
 * Sanity checks on a generated reply, before it is stored or sent.
 *
 * Pure and dependency-free so it can be tested directly — the values it guards
 * are the ones that would otherwise reach a customer.
 *
 * Motivated by a real failure: a draft came back with its opening words missing
 * ("ow businessy stuff! …") and further words dropped mid-sentence. The damage
 * was in the model's own output — the corrupt text was already corrupt in the
 * API response — and 27 attempts could not reproduce it. What did stand out was
 * the cost: 294 output tokens to produce 131 characters, against 26–107 tokens
 * in every clean generation on the same input.
 *
 * ## What changed when the agent got tools
 *
 * That cost ratio was only readable because thinking was disabled. Thinking is
 * on now — see `THINKING` in `generate.ts` for why — and `outputTokens` counts
 * reasoning, so on a turn the model thought about, the number says nothing
 * about the reply. The ratio check is therefore **conditional** rather than
 * deleted: on a turn with no thinking it is exactly the check it always was,
 * and on a turn with thinking it is skipped, honestly, rather than being fed a
 * number it cannot interpret.
 *
 * In exchange there is a new check that the old arrangement had no need for. A
 * model that is meant to call a tool sometimes writes the call into its visible
 * text instead — the turn succeeds, nothing runs, and the reply reads like a
 * function call or, worse, like a confirmation of something that never
 * happened. A customer-facing SMS has no legitimate reason to contain the name
 * of one of this app's tools, so that is a cheap and near-false-positive-free
 * thing to refuse.
 */

/** Below this, a reply is too short for the ratio to mean anything. */
export const INTEGRITY_MIN_TOKENS = 150;

/** How far above the expected token cost is still considered normal. */
export const INTEGRITY_MAX_RATIO = 3;

/** Rough English rate, used only to size the expectation. */
const CHARS_PER_TOKEN = 3;

/** Fixed cost of the JSON envelope around the reply. */
const ENVELOPE_TOKENS = 25;

export type IntegrityContext = {
  /**
   * Whether this turn came back with a `thinking` block.
   *
   * Not how *much* it thought — the reasoning text is omitted by default and
   * the API does not break thinking tokens out of `output_tokens`, so "did it
   * think at all" is the most that can be known, and it is enough to decide
   * whether the ratio below means anything.
   */
  thought: boolean;
  /**
   * The tools this generation was offered, if any.
   *
   * Their names, not their schemas. Empty for a bot with nothing configured,
   * which is most of them, and which makes the leakage check below a no-op.
   */
  toolNames: readonly string[];
};

/**
 * Returns why a reply looks damaged, or null when it looks fine.
 *
 * Deliberately loose: it is here to catch the egregious case, not to police
 * normal variation.
 */
export function looksCorrupted(
  reply: string,
  outputTokens: number,
  { thought, toolNames }: IntegrityContext = { thought: false, toolNames: [] },
): string | null {
  // Reasoning comes back in its own `thinking` blocks, never inside the reply,
  // so a tag like this in visible text is leakage however the turn was
  // configured. Truer now than when thinking was off, not less true.
  if (/<\/?(thinking|antml|internal)\b/i.test(reply)) {
    return "reply contains internal tags";
  }

  // The tool call that was written down instead of made. Nothing a customer
  // should read contains `book_appointment`, so this needs no cleverness about
  // *how* the call was spelled — the name alone is the tell.
  const leaked = toolNames.find((name) => reply.includes(name));
  if (leaked) {
    return `reply mentions the ${leaked} tool instead of calling it`;
  }

  // Only meaningful when the count tracks the reply, which it does exactly
  // when the model did not think. See the note at the top of this file.
  if (!thought && outputTokens > INTEGRITY_MIN_TOKENS) {
    const expected = reply.length / CHARS_PER_TOKEN + ENVELOPE_TOKENS;
    if (outputTokens > expected * INTEGRITY_MAX_RATIO) {
      return `spent ${outputTokens} output tokens on ${reply.length} characters`;
    }
  }

  return null;
}
