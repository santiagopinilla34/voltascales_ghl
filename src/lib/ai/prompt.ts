import "server-only";

import type { Message } from "@/types/database";

/**
 * Turns a contact's message history into Claude turns (PRD 5).
 *
 * Pure and side-effect free so it can be checked without calling the API —
 * this is the part of the chatbot most likely to be quietly wrong, and a wrong
 * transcript produces a plausible-sounding reply to the wrong conversation.
 */

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

/**
 * How many messages to send. SMS threads are short; this bounds cost on a
 * long-running lead rather than being a limit anyone should hit.
 */
export const HISTORY_LIMIT = 40;

/**
 * Every outbound message is `assistant`, whoever actually sent it.
 *
 * A manual reply from Santiago, an automation's auto-text and a previous AI
 * reply are indistinguishable to the person on the other end — they are all
 * "the business". Attributing only AI messages to the assistant would let the
 * model contradict something Santiago already told the lead, which is exactly
 * the failure the human-takeover rule exists to prevent.
 */
function roleFor(message: Message): ConversationTurn["role"] {
  return message.direction === "out" ? "assistant" : "user";
}

export function buildConversation(
  messages: Message[],
  limit: number = HISTORY_LIMIT,
): ConversationTurn[] {
  const turns = messages
    // Defensive: callers pass ascending, but a wrong order here would read as
    // the lead answering questions before they were asked.
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .filter((message) => (message.body ?? "").trim().length > 0)
    .map((message) => ({
      role: roleFor(message),
      content: (message.body ?? "").trim(),
    }));

  const recent = turns.slice(-limit);

  // The API requires the first turn to be `user`. This is not hypothetical:
  // the missed-call automation texts the contact before they have ever texted
  // us, so a thread that starts with an outbound message is the normal case
  // for anyone who called first. Dropping the leading assistant turns loses a
  // little context; sending them is a 400.
  const firstUser = recent.findIndex((turn) => turn.role === "user");
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

/**
 * Whether there is anything to reply to.
 *
 * An empty conversation means every message was outbound or blank — nothing
 * the lead has said. Replying to that would be the AI talking to itself.
 */
export function canReply(turns: ConversationTurn[]): boolean {
  return turns.length > 0 && turns.at(-1)?.role === "user";
}
