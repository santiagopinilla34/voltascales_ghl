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
 */

/** Below this, a reply is too short for the ratio to mean anything. */
export const INTEGRITY_MIN_TOKENS = 150;

/** How far above the expected token cost is still considered normal. */
export const INTEGRITY_MAX_RATIO = 3;

/** Rough English rate, used only to size the expectation. */
const CHARS_PER_TOKEN = 3;

/** Fixed cost of the JSON envelope around the reply. */
const ENVELOPE_TOKENS = 25;

/**
 * Returns why a reply looks damaged, or null when it looks fine.
 *
 * The token ratio only works because thinking is disabled for this call — with
 * thinking on, `outputTokens` includes reasoning and says nothing about the
 * reply. Deliberately loose: it is here to catch the egregious case, not to
 * police normal variation.
 */
export function looksCorrupted(
  reply: string,
  outputTokens: number,
): string | null {
  // Thinking is off, so an internal tag in a visible reply is never correct.
  if (/<\/?(thinking|antml|internal)\b/i.test(reply)) {
    return "reply contains internal tags";
  }

  if (outputTokens > INTEGRITY_MIN_TOKENS) {
    const expected = reply.length / CHARS_PER_TOKEN + ENVELOPE_TOKENS;
    if (outputTokens > expected * INTEGRITY_MAX_RATIO) {
      return `spent ${outputTokens} output tokens on ${reply.length} characters`;
    }
  }

  return null;
}
