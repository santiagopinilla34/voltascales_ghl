"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  Send,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { aiModelLabel } from "@/lib/ai/models";
import { formatFullTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AiDraft } from "@/types/database";

type PreviewResponse = {
  draft: AiDraft;
  turns: number;
  wouldSend: boolean;
  blockedBy: string[];
};

/** Whichever draft was written last, or the one that exists. */
function newest(a: AiDraft | null, b: AiDraft | null): AiDraft | null {
  if (!a) return b;
  if (!b) return a;
  return a.created_at >= b.created_at ? a : b;
}

/**
 * Shows the newest AI reply for a contact, and generates one on demand.
 *
 * The button here never sends: the route behind it does not import the Twilio
 * client, so the only way a reply generated from this panel reaches the contact
 * is if you copy it into the reply box yourself.
 *
 * What it *displays* may well have been sent already — in Live mode the webhook
 * texts the reply and stamps `sent_at` on the same row. Saying "not sent" over
 * a message the contact has already received would be worse than saying
 * nothing, so the header reads that field rather than assuming.
 */
export function AiPreviewPanel({
  contactId,
  latestDraft,
}: {
  contactId: string;
  /** Newest stored draft, so a previous preview survives a page load. */
  latestDraft: AiDraft | null;
}) {
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [pending, setPending] = useState(false);
  // The draft that was dismissed, not a flag. A boolean hid this panel for the
  // rest of the visit: dismiss the card for one reply and every later one —
  // including a reply the AI has just texted the contact — was suppressed too.
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The newer of the two, rather than "a local generation always wins". The
  // local one used to win outright, which was right while nothing else could
  // change underneath it — but the live path writes a draft of its own the
  // moment a text is answered, so preferring the local copy meant an answered
  // conversation kept showing the preview you happened to run beforehand.
  const draft = newest(result?.draft ?? null, latestDraft);
  const visible = draft && draft.id !== dismissedId;

  // The blocked-by note belongs to the generation it came back with, so it is
  // only shown while that generation is still the draft on screen.
  const preview = result && draft?.id === result.draft.id ? result : null;

  // Set only by the Live-mode send path. A generation made here is never sent,
  // so a fresh `result` is always unsent — the two cases stay distinct without
  // any special-casing of where the draft came from.
  const sent = Boolean(draft?.sent_at);

  async function generate() {
    setPending(true);
    setDismissedId(null);

    try {
      const response = await fetch(`/api/contacts/${contactId}/ai-preview`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<
        PreviewResponse & { error: string }
      >;

      if (!response.ok) {
        toast.error("Could not generate a reply", {
          description: payload.error,
        });
        return;
      }

      setResult(payload as PreviewResponse);
    } catch {
      toast.error("Could not reach the server");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="shrink-0 px-3 pt-3">
      {visible && (
        <div
          className={cn(
            "mb-2 rounded-lg border p-3",
            sent
              ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
              : "border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/30",
          )}
        >
          <div className="mb-1.5 flex items-center gap-2">
            {sent ? (
              <Send className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
            ) : (
              <Sparkles className="size-3.5 shrink-0 text-violet-700 dark:text-violet-400" />
            )}
            <span
              className={cn(
                "text-xs font-semibold",
                sent
                  ? "text-emerald-900 dark:text-emerald-200"
                  : "text-violet-900 dark:text-violet-200",
              )}
            >
              {sent ? "Sent by AI" : "Draft — not sent"}
            </span>
            {draft.needs_human && (
              <Badge
                variant="secondary"
                className="border-transparent bg-amber-100 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300"
              >
                {sent ? "Handed off to you" : "Hands off after sending"}
              </Badge>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="ml-auto size-6"
              onClick={() => setDismissedId(draft.id)}
              aria-label="Dismiss draft"
            >
              <X className="size-3.5" />
            </Button>
          </div>

          {/* Capped because this panel is `shrink-0`: a draft near the 1600-char
              SMS limit would otherwise squeeze the thread above it to nothing
              and then push past the bottom of the pane. */}
          <p className="max-h-32 overflow-y-auto text-sm break-words whitespace-pre-wrap">
            {draft.body}
          </p>

          {preview && !preview.wouldSend && (
            <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-[11px]">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" />
              <span>
                In live mode this would not have been sent:{" "}
                {preview.blockedBy.join("; ")}.
              </span>
            </p>
          )}

          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span>{aiModelLabel(draft.model)}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {draft.input_tokens ?? 0} in / {draft.output_tokens ?? 0} out
            </span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{draft.body.length} chars</span>
            <span aria-hidden>·</span>
            {/* Once it has gone out, when it went out is the more useful of the
                two timestamps — and they are seconds apart anyway. */}
            <time dateTime={draft.sent_at ?? draft.created_at}>
              {formatFullTimestamp(draft.sent_at ?? draft.created_at)}
            </time>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-6 gap-1 px-2 text-[11px]"
              onClick={copy}
            >
              {copied ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={generate}
        disabled={pending}
        className="w-full"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Sparkles className="size-3.5" />
        )}
        {pending ? "Generating…" : "Preview AI reply"}
      </Button>
    </div>
  );
}
