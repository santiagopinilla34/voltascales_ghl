"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { EASE_OUT } from "./motion";
import { usePendingMessages } from "./pending-messages";

/** Matches the limit the messages route enforces. */
const MAX_BODY_LENGTH = 1600;

/**
 * Manual reply composer. Posts to the existing route rather than a Server
 * Action so there is one code path that sends an SMS, with its Twilio error
 * handling and its human-takeover rule in a single place.
 */
export function ReplyBox({
  contactId,
  contactLabel,
  aiEnabled,
}: {
  contactId: string;
  contactLabel: string;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reduce = useReducedMotion();
  const {
    pending,
    add: addPending,
    settle: settlePending,
    discard: discardPending,
  } = usePendingMessages();

  const trimmed = body.trim();
  const tooLong = body.length > MAX_BODY_LENGTH;

  // One message at a time: the button reopens when the last one has actually
  // landed in the thread as a saved row.
  //
  // The gate is deliberately `pending.length`, not the in-flight request and
  // not the delivery status. Those are the two things it would be easy to
  // reach for and both are wrong:
  //
  //   * The request resolving only means Twilio accepted it. The row still has
  //     to come back through `router.refresh()`, and reopening before it does
  //     lets a second message be composed against a thread that has not caught
  //     up with the first.
  //   * Waiting for `delivered` would hold the composer shut for however long
  //     a carrier takes, which can be minutes and can be never. Sending should
  //     not depend on the recipient's phone being switched on.
  //
  // `pending` empties at exactly the right moment — when `MessageThread`
  // reconciles the optimistic bubble against the real row — which is what
  // "wait until it shows up in the chat" actually means. It keeps the thread in
  // order for free, too: a second message cannot be sent until the first is
  // durably ahead of it.
  const waitingForLastMessage = pending.length > 0;
  const canSend = trimmed.length > 0 && !tooLong && !waitingForLastMessage;

  function send() {
    if (!canSend) return;

    // The bubble goes up first and the box empties with it, before anything is
    // asked of the network. Sending a text is a round trip to Twilio behind a
    // round trip to us — a second and a half on a good day — and the composer
    // used to spend all of it holding the message the user had already
    // finished writing, with a spinner as the only sign it had been read.
    //
    // The cost of showing it early is that it can still fail, so the two
    // failure paths below put it back exactly as it was: bubble withdrawn,
    // words returned to the box, focus back in it. That is a worse outcome than
    // never having shown it, and it happens on the rare send rather than on
    // every one.
    const pendingId = addPending(trimmed);
    const restore = trimmed;
    setBody("");

    startTransition(async () => {
      let response: Response;
      try {
        response = await fetch(`/api/contacts/${contactId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        });
      } catch {
        discardPending(pendingId);
        setBody(restore);
        textareaRef.current?.focus();
        toast.error("Could not reach the server", {
          description: "Check your connection and try again.",
        });
        return;
      }

      if (!response.ok) {
        const { error } = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        discardPending(pendingId);
        setBody(restore);
        textareaRef.current?.focus();
        toast.error("Message not sent", {
          description: error ?? `The server responded with ${response.status}.`,
        });
        return;
      }

      // Twilio has it. The bubble stays where it is and is handed the id of the
      // row it became, so the thread can retire it the moment that row arrives
      // rather than leaving a gap in between. See `pending-messages.tsx`.
      const { message } = (await response.json().catch(() => ({}))) as {
        message?: { id?: string };
      };

      if (message?.id) {
        settlePending(pendingId, message.id);
      } else {
        // A 201 with no row in it should not be possible, and if it happens the
        // bubble has nothing to reconcile against and would sit there for good.
        // Dropping it leaves the refresh below to show whatever was really
        // saved, which is the honest answer either way.
        discardPending(pendingId);
      }

      if (aiEnabled) {
        toast.info("AI handling turned off", {
          description: "Replying by hand takes this conversation over.",
        });
      }
      router.refresh();
      textareaRef.current?.focus();
    });
  }

  return (
    <div className="shrink-0 p-3">
      {/* One bordered box holding the field and the button, rather than a
          textarea with a button parked beside it. The composer is a single
          thing you are filling in, and the border is what says where it
          starts and stops.

          The reference this follows also carries a row of attachment, emoji,
          template and snippet buttons along the bottom. Every one of them is
          left out: this sends SMS through Twilio with a body and nothing else
          — there are no attachments, no saved replies and no snippet store to
          open. Four icons that open nothing would be worse than the gap. */}
      <div className="bg-background focus-within:border-ring focus-within:ring-ring/50 rounded-xl border transition-shadow focus-within:ring-[3px]">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line — chat convention.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={`Reply to ${contactLabel}…`}
          rows={2}
          // Never disabled. It used to lock for the whole round trip, which
          // made the composer feel like a form being submitted rather than a
          // chat: the message you had just sent was gone from the box, not yet
          // in the thread, and you could not start the next one. The bubble
          // above now carries the state, so the box is free to stay yours.
          aria-label="Reply message"
          // The box around it draws the edge now, so the field itself has
          // none — two nested borders read as a field inside a field.
          className="max-h-40 min-h-[2.75rem] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        />

        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          {/* A disabled button with no reason beside it reads as broken. This
              outranks the AI notice while it shows: that one is about what
              your next reply will do, and this is about why you cannot send it
              yet. */}
          <span className="text-muted-foreground min-w-0 truncate text-[11px]">
            {waitingForLastMessage
              ? "Waiting for your last message to land…"
              : aiEnabled
                ? "Sending a reply turns AI handling off for this contact."
                : "Enter to send · Shift+Enter for a new line"}
          </span>

          <div className="flex shrink-0 items-center gap-2">
            {body.length > MAX_BODY_LENGTH - 200 && (
              <span
                className={cn(
                  "text-muted-foreground text-[11px] tabular-nums",
                  tooLong && "text-destructive font-medium",
                )}
              >
                {body.length} / {MAX_BODY_LENGTH}
              </span>
            )}

            {/* Green and labelled. As an icon-only button in the default
                variant it was a pale grey square — the one control on the
                screen that sends something, looking like the least important
                thing on it.

                The press is acknowledged on the way down, before the request
                that follows it. Sending an SMS is a round trip to Twilio; the
                message itself cannot appear for a few hundred milliseconds,
                and until it does the only thing that had moved was a spinner
                inside the button. `whileTap` is a wrapper rather than a prop
                on the button because `Button` is a styled shadcn component,
                and wrapping it is cheaper than making a motion component of it
                for one 3% squash. */}
            <motion.div
              whileTap={
                canSend && !reduce
                  ? { transform: "scale(0.97)" }
                  : { transform: "scale(1)" }
              }
              transition={{ duration: 0.1, ease: EASE_OUT }}
            >
              <Button
                type="button"
                onClick={send}
                disabled={!canSend}
                size="lg"
                className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                {/* No spinner any more. The message is already in the thread
                    with "Sending…" under it by the time this would appear, and
                    two indicators for one send meant the eye had to check the
                    button to find out what the bubble was already saying. */}
                <Send className="size-4" />
                Send
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
