"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { MessageStatus } from "@/types/database";

import { EASE_OUT } from "./motion";

/**
 * "Delivered", under the last message you sent.
 *
 * ## Only the last one
 *
 * Following iMessage, and for its reason rather than for the resemblance. A
 * receipt on every outbound bubble is a column of identical grey words down the
 * side of the thread that nobody reads and that pushes the messages apart; the
 * question it answers — *did my message get there* — is only ever live about
 * the most recent one. Anything older was answered by the conversation
 * continuing.
 *
 * So exactly one receipt is rendered per thread, under the last outbound
 * message, and it disappears when you send another. See `MessageThread`, which
 * decides which bubble that is.
 *
 * ## Failures are the exception, and stay put
 *
 * `undelivered` and `failed` are the one case where the newest message is not
 * the only one worth reporting on — a text that never arrived is still a
 * problem after the next one goes out. That is a larger change to how the
 * thread reads than this component should make on its own, so for now the rule
 * stays "the last outbound message", and a failure on an older one is visible
 * in the account's error alerts instead, where `sendSms` already records it.
 */
export function DeliveryReceipt({
  status,
  /** True while the send is still in flight — an optimistic bubble. */
  sending = false,
}: {
  status: MessageStatus | null;
  sending?: boolean;
}) {
  const reduce = useReducedMotion();
  const label = receiptLabel(status, sending);

  // Null covers two states that both mean "nothing to report": a message from
  // before delivery tracking existed, and a local environment where Twilio has
  // no callback URL to reach. Both should read as an ordinary sent message
  // rather than as a message with a problem, so nothing is rendered at all.
  if (!label) return null;

  const failed = status === "undelivered" || status === "failed";

  return (
    // `mode="wait"` so the words never overlap mid-crossfade. The whole element
    // is 11px grey text; two of them on top of each other for 140ms is legible
    // as a smudge and nothing else.
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        // Keyed on the text, so "Sent" becoming "Delivered" is an exit and an
        // entrance rather than a silent swap. The fade is the whole point of
        // the feature: the word should arrive, not blink into place.
        key={label}
        initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(2px)" }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
        exit={{ opacity: 0 }}
        transition={
          reduce
            ? { duration: 0.12 }
            : { duration: 0.28, ease: EASE_OUT, opacity: { duration: 0.28 } }
        }
        className={
          failed
            ? "text-destructive px-1 text-[11px] font-medium"
            : "text-muted-foreground px-1 text-[11px]"
        }
      >
        {label}
      </motion.span>
    </AnimatePresence>
  );
}

/**
 * The word under the message, or null for the states worth saying nothing at
 * all about.
 *
 * `queued` and `sending` are deliberately silent. They are real states and they
 * are also the uninteresting middle of a process that normally takes under a
 * second — labelling them would mean the receipt flickered through two words on
 * the way to the one the reader wanted, which is worse than waiting for it.
 * The optimistic bubble is the exception: there the reader has just pressed a
 * button and needs to see that something is happening.
 */
function receiptLabel(
  status: MessageStatus | null,
  sending: boolean,
): string | null {
  if (sending) return "Sending…";

  switch (status) {
    case "delivered":
      return "Delivered";
    case "sent":
      return "Sent";
    case "undelivered":
      return "Not delivered";
    case "failed":
      return "Failed to send";
    // `queued`, `sending`, and null — see above.
    default:
      return null;
  }
}
