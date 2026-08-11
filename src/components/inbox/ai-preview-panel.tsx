"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Sparkles, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { aiModelLabel } from "@/lib/ai/models";
import { formatFullTimestamp } from "@/lib/format";
import type { AiDraft } from "@/types/database";

type PreviewResponse = {
  draft: AiDraft;
  turns: number;
  wouldSend: boolean;
  blockedBy: string[];
};

/**
 * Generates an AI reply on demand and shows it. Never sends.
 *
 * The endpoint behind this cannot send either — it does not import the Twilio
 * client. The only way this text reaches the contact is if you copy it into the
 * reply box and press send yourself.
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
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  // A fresh generation wins; otherwise fall back to whatever was stored.
  const draft = result?.draft ?? latestDraft;
  const visible = draft && !dismissed;

  async function generate() {
    setPending(true);
    setDismissed(false);

    try {
      const response = await fetch(`/api/contacts/${contactId}/ai-preview`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<
        PreviewResponse & { error: string }
      >;

      if (!response.ok) {
        toast.error("Could not generate a reply", { description: payload.error });
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
        <div className="mb-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
          <div className="mb-1.5 flex items-center gap-2">
            <Sparkles className="size-3.5 shrink-0 text-violet-700 dark:text-violet-400" />
            <span className="text-xs font-semibold text-violet-900 dark:text-violet-200">
              Draft — not sent
            </span>
            {draft.needs_human && (
              <Badge
                variant="secondary"
                className="border-transparent bg-amber-100 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300"
              >
                Wants a human
              </Badge>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="ml-auto size-6"
              onClick={() => setDismissed(true)}
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

          {result && !result.wouldSend && (
            <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-[11px]">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" />
              <span>
                In live mode this would not have been sent:{" "}
                {result.blockedBy.join("; ")}.
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
            <time dateTime={draft.created_at}>
              {formatFullTimestamp(draft.created_at)}
            </time>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-6 gap-1 px-2 text-[11px]"
              onClick={copy}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
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
