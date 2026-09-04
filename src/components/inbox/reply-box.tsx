"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = body.trim();
  const tooLong = body.length > MAX_BODY_LENGTH;
  const canSend = trimmed.length > 0 && !tooLong && !pending;

  function send() {
    if (!canSend) return;

    startTransition(async () => {
      let response: Response;
      try {
        response = await fetch(`/api/contacts/${contactId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        });
      } catch {
        toast.error("Could not reach the server", {
          description: "Check your connection and try again.",
        });
        return;
      }

      if (!response.ok) {
        const { error } = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error("Message not sent", {
          description: error ?? `The server responded with ${response.status}.`,
        });
        return;
      }

      // Only clear once Twilio has accepted it — a failed send keeps the text
      // in the box so it isn't lost.
      setBody("");
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
          disabled={pending}
          aria-label="Reply message"
          // The box around it draws the edge now, so the field itself has
          // none — two nested borders read as a field inside a field.
          className="max-h-40 min-h-[2.75rem] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        />

        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <span className="text-muted-foreground min-w-0 truncate text-[11px]">
            {aiEnabled
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
                thing on it. */}
            <Button
              type="button"
              onClick={send}
              disabled={!canSend}
              size="lg"
              className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
