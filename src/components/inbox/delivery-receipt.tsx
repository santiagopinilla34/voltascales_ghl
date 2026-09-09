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

  const failed = status === "undelivered" || status === "failed";

  return (
    // `AnimatePresence` is rendered unconditionally, with the emptiness on the
    // inside. Returning null early instead — the obvious way to write "nothing
    // to show yet" — is what silently removed the fade: `AnimatePresence` only
    // animates a child in if it was already mounted when that child appeared,
    // and `initial={false}` explicitly suppresses whatever it is holding on its
    // own first render. An early return meant it mounted at the same instant
    // "Delivered" did, so the one moment the animation exists for was the one
    // moment it was guaranteed not to play.
    //
    // Mounted empty from the start, the word is a genuine entrance and fades
    // in. `initial={false}` still earns its place: on a page load, a thread
    // whose last message was delivered days ago should simply have its receipt,
    // not animate it in as though it had just happened.
    //
    // `mode="wait"` so two words can never overlap. Nearly always this is a
    // single fade in from nothing, but a message going straight to
    // `undelivered` can replace a "Delivered" above it, and 11px grey text
    // crossfading into different 11px grey text reads as a smudge.
    <AnimatePresence mode="wait" initial={false}>
      {label && (
        <motion.span
          // Keyed on the text so a change of word is an exit and an entrance
          // rather than a silent swap.
          key={label}
          initial={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, transform: "translateY(2px)" }
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
      )}
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
