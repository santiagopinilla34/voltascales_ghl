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
export function DeliveryReceipt({ status }: { status: MessageStatus | null }) {
  const reduce = useReducedMotion();
  const label = receiptLabel(status);

  // Null covers everything with nothing to report: a message still on its way,
  // one from before delivery tracking existed, and a local environment where
  // Twilio has no callback URL to reach. All of them should read as an ordinary
  // message rather than as a message with a problem, so nothing renders at all
  // and the line simply appears when there is finally something to say.
  if (!label) return null;

  const failed = status === "undelivered" || status === "failed";

  return (
    // `mode="wait"` so two words can never overlap. With the intermediate
    // states silent this is nearly always a single fade in from nothing, but a
    // message going straight to `undelivered` can still replace a "Delivered"
    // on the row above it, and 11px grey text crossfading into different 11px
    // grey text reads as a smudge.
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        // Keyed on the text so a change of word is an exit and an entrance
        // rather than a silent swap. The fade is the whole point: the receipt
        // should arrive, not blink into place.
        key={label}
        initial={
          reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(2px)" }
        }
        animate={
          reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }
        }
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
 * The word under the message, or null — which is most of the time.
 *
 * Only two things are worth saying: it arrived, or it did not.
 *
 * Everything on the way there is silent. `queued`, `sending` and `sent` are all
 * real states and all of them are the uninteresting middle of something that
 * normally takes about a second, so labelling them meant the receipt ticked
 * through two words before reaching the one the reader was waiting for —
 * "Sending…", then "Sent", then "Delivered", three lines of text for one
 * message. The arrival is the event; the rest is the machine narrating itself.
 *
 * `sent` is the one that looks like it should stay and should not. It means
 * Twilio handed the message to a carrier, which is not a fact about the
 * recipient at all — and because it is followed by `delivered` a moment later,
 * its only effect on screen was to make the word the reader wanted arrive
 * second.
 *
 * The failures stay. A message that never arrived has to say so, or it is
 * indistinguishable from one that did.
 */
function receiptLabel(status: MessageStatus | null): string | null {
  switch (status) {
    case "delivered":
      return "Delivered";
    case "undelivered":
      return "Not delivered";
    case "failed":
      return "Failed to send";
    // `queued`, `sending`, `sent`, and null — see above.
    default:
      return null;
  }
}
