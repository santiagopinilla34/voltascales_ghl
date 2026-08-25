"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  readWebPage,
  saveWebPageContent,
} from "@/app/(app)/ai-agents/knowledge-base/[baseId]/web-crawler/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { countWords, displayPath } from "@/lib/knowledge/crawl";
import { formatFullTimestamp } from "@/lib/format";

/**
 * What the crawler actually took off a page — and the chance to fix it.
 *
 * Editable rather than read-only, which is the whole reason it is worth
 * opening. A crawler takes the cookie banner, the nav and the footer along
 * with the prose, and no amount of parsing decides reliably which of those a
 * business wants its agent quoting. A person reading three screens of text and
 * deleting four lines does, in about a minute.
 *
 * The text is fetched when the dialog opens rather than carried in the table.
 * `content` is the one large column on `knowledge_web_pages`, and shipping
 * forty pages of it to the browser so that one can be opened is the sort of
 * thing that makes a screen feel slow for no visible reason.
 */
export function ScrapedDataDialog({
  pageId,
  onOpenChange,
  onSaved,
}: {
  /** The page to show. The dialog is mounted only while there is one. */
  pageId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  // Starts true and is only ever turned off. The dialog is keyed on the page
  // it shows, so a different page is a fresh mount rather than a reset.
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");

  useEffect(() => {
    let cancelled = false;

    readWebPage(pageId).then((result) => {
      // The dialog can be closed while this is in flight, and setting state on
      // the way out would put the next page's text under the previous title.
      if (cancelled) return;

      if (!result.ok) {
        toast.error(result.error);
        onOpenChange(false);
        return;
      }

      setUrl(result.value.url);
      setUpdatedAt(result.value.updatedAt);
      setContent(result.value.content);
      setOriginal(result.value.content);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [pageId, onOpenChange]);

  const dirty = content !== original;

  function save() {
    startTransition(async () => {
      const result = await saveWebPageContent(pageId, content);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Saved");
      setOriginal(content);
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            Data scraped from website
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <a
            href={url || undefined}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary inline-flex min-w-0 items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <span className="truncate">{url ? displayPath(url) : "…"}</span>
            <ExternalLink className="size-3.5 shrink-0" />
          </a>

          {updatedAt && (
            <span className="text-muted-foreground text-xs">
              Last updated on {formatFullTimestamp(updatedAt)}
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-muted-foreground flex min-h-64 items-center justify-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading the page&apos;s text…
          </div>
        ) : (
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            aria-label="Scraped text"
            spellCheck={false}
            className="min-h-64 flex-1 resize-none font-mono text-xs leading-relaxed"
          />
        )}

        <DialogFooter className="sm:justify-between">
          <span className="text-muted-foreground self-center text-xs tabular-nums">
            {countWords(content)} words used
          </span>

          <span className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={pending || loading || !dirty}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
