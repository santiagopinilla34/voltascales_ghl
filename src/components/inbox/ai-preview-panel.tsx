"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
import { toolSummary, toolWrites } from "@/lib/ai/tool-labels";
import { formatFullTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AiDraft } from "@/types/database";

import { EASE_OUT, EXIT_MS, RESIZE } from "./motion";

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
  const reduce = useReducedMotion();

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

  // What the agent actually did while writing this, which is the one thing
  // about an AI reply that a person cannot get from reading the reply. A
  // preview's tools are dry-run, so its row is phrased as a rehearsal — the
  // same names, a different verb, and no claim that a meeting exists.
  const tools = draft?.tools_used ?? [];
  const writes = toolWrites(tools);
  const rehearsal = draft?.source === "preview";

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

  // The card opening and closing, as one set of values used by both the draft
  // and the placeholder that precedes it.
  //
  // Height, which is normally the property not to animate — but this panel is
  // `shrink-0` in a flex column, so its height is subtracted from the thread
  // above it. Popping a card in took a chunk out of the conversation between
  // one frame and the next and shoved every message up by 90-odd pixels, which
  // is precisely the jarring change motion is supposed to prevent. There is no
  // transform that expresses "and the thread is now shorter", so this is the
  // accordion exception: `overflow-hidden` on the box that resizes, padding on
  // an inner one so the content does not squash as it goes.
  //
  // Under reduced motion the box still has to change size — there is no
  // version of this where it does not — so the height is taken instantly and
  // only the fade is kept, which is what the CSS block in `globals.css` does
  // to every other animation in the app.
  const collapsed = reduce
    ? { opacity: 0 }
    : { opacity: 0, height: 0 };
  const expanded = reduce
    ? { opacity: 1 }
    : { opacity: 1, height: "auto" as const };

  return (
    <div className="shrink-0 px-3 pt-3">
      {/* No `mode`, so the outgoing card collapses over the same frames the
          incoming one expands. `mode="wait"` would have played them one after
          the other — the panel shutting completely and then reopening — which
          on the regenerate path is a shut door between you and the thing you
          just asked for. */}
      <AnimatePresence initial={false}>
        {pending ? (
          <motion.div
            key="generating"
            initial={collapsed}
            animate={expanded}
            exit={collapsed}
            transition={RESIZE}
            className="overflow-hidden"
          >
            {/* The same box the draft arrives in, holding its place while the
                model writes. The button below already says "Generating…", but
                it says it three inches from where the answer appears; a
                request that shows nothing where the result will be reads as a
                request that went nowhere — and this one can run for several
                seconds.

                Violet and not green: it is standing in for a draft, and the
                colours in this panel are load-bearing — green here means the
                contact has already been sent it. */}
            <div className="mb-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 shrink-0 text-violet-700 dark:text-violet-400" />
                <span className="text-xs font-semibold text-violet-900 dark:text-violet-200">
                  Writing a reply…
                </span>
                {/* The same three dots the agent screen uses while a message
                    is being composed, from `globals.css`. A CSS animation
                    rather than a `motion` one on purpose: it loops for as long
                    as the request takes, and CSS keyframes run off the main
                    thread — this is the one moment on this screen where the
                    main thread is genuinely busy. */}
                <span aria-hidden className="ml-0.5 flex items-center gap-1">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="agent-typing-dot size-1 rounded-full bg-violet-500"
                      style={{ animationDelay: `${dot * 160}ms` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          </motion.div>
        ) : visible ? (
          <motion.div
            // Keyed on the draft, not on "a draft exists". Generating a second
            // reply is one card replacing another, and they should cross over
            // rather than the text swapping inside a box that never moved.
            key={draft.id}
            initial={collapsed}
            animate={expanded}
            exit={collapsed}
            transition={RESIZE}
            className="overflow-hidden"
          >
            <motion.div
              // The card's own contents fade in a little behind its box, so
              // the panel reads as opening and then filling rather than as a
              // block of text being pushed into view.
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: EXIT_MS, ease: EASE_OUT, delay: 0.06 }}
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
            {/* Ahead of the hand-off badge, and louder: a reply that changed
                the calendar is the more consequential fact about the row. */}
            {writes.map((label) => (
              <Badge
                key={label}
                variant="secondary"
                className="border-transparent bg-sky-100 text-[10px] font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-300"
              >
                {rehearsal ? `Would have: ${label.toLowerCase()}` : label}
              </Badge>
            ))}
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

          {/* The reads too, not only the writes above. "Checked the calendar"
              on its own is the row that explains a reply which offered times
              and stopped — which the badges, by design, say nothing about. */}
          {tools.length > 0 && (
            <p className="text-muted-foreground mt-2 text-[11px]">
              {toolSummary(tools)}
            </p>
          )}

          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            {/* Which model, how many tokens and how many characters are
                diagnostics — worth having beside the draft on a desktop, and
                not worth the two extra wrapped lines they cost on a phone,
                where this panel was already taking as much of the screen as
                the conversation above it. The timestamp stays: "when did it
                say this" is the one part you read rather than audit. */}
            <span className="hidden items-center gap-2 sm:flex">
              <span>{aiModelLabel(draft.model)}</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">
                {draft.input_tokens ?? 0} in / {draft.output_tokens ?? 0} out
              </span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{draft.body.length} chars</span>
              <span aria-hidden>·</span>
            </span>
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
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
