"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
    <div className="bg-background shrink-0 border-t p-3">
      <div className="flex items-end gap-2">
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
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none"
        />
        <Button
          type="button"
          onClick={send}
          disabled={!canSend}
          size="icon"
          aria-label="Send reply"
          className="size-10 shrink-0"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>

      <div className="text-muted-foreground mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span>
          {aiEnabled
            ? "Sending a reply turns AI handling off for this contact."
            : "Enter to send · Shift+Enter for a new line"}
        </span>
        {body.length > MAX_BODY_LENGTH - 200 && (
          <span className={tooLong ? "text-destructive font-medium" : undefined}>
            {body.length} / {MAX_BODY_LENGTH}
          </span>
        )}
      </div>
    </div>
  );
}
