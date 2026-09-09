import "server-only";

import type { MessageStatus } from "@/types/database";

/**
 * Twilio's MessageStatus values, narrowed to the ones this app stores.
 *
 * Twilio's vocabulary is wider than the CHECK constraint on `messages.status`,
 * and the difference is not accidental:
 *
 *   * `accepted` and `scheduled` both mean "Twilio has it, nothing has moved
 *     yet", which is what `queued` already says. Three spellings of one state
 *     would put three different words under a message for no reason a reader
 *     could act on.
 *   * `receiving` and `received` describe an inbound message. Those rows carry
 *     a null status — see the migration for why arrival is not a delivery
 *     receipt.
 *
 * Anything unrecognised returns null rather than throwing. A status callback is
 * fire-and-forget from Twilio's side; a new value in their vocabulary should
 * cost us one receipt, not the webhook.
 */
export function toMessageStatus(
  raw: string | null | undefined,
): MessageStatus | null {
  switch (raw) {
    case "accepted":
    case "scheduled":
    case "queued":
      return "queued";
    case "sending":
    case "sent":
    case "delivered":
    case "undelivered":
    case "failed":
      return raw;
    default:
      return null;
  }
}

/**
 * How far along the delivery a status is, for comparing two of them.
 *
 * Status callbacks are not ordered. Twilio fires one per transition and they
 * race — `sent` arriving after `delivered` is routine, not a fault — so a
 * webhook that writes whatever it was handed will visibly walk a receipt
 * backwards from "Delivered" to "Sent" under the reader's eyes.
 *
 * The terminal three share a rank. They are mutually exclusive outcomes rather
 * than steps on a path, so none of them may overwrite another: whichever
 * verdict lands first is the one the carrier reached, and a later one is a
 * duplicate or a replay.
 */
const RANK: Record<MessageStatus, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  undelivered: 3,
  failed: 3,
};

/**
 * Whether `next` is news, given what is already recorded.
 *
 * A null `current` is a row that predates delivery tracking or was never given
 * a status at insert; anything real is an improvement on knowing nothing.
 */
export function advancesStatus(
  current: MessageStatus | null,
  next: MessageStatus,
): boolean {
  if (!current) return true;
  return RANK[next] > RANK[current];
}
