"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  addWebsite,
  discoverPages,
  type Discovery,
} from "@/app/(app)/ai-agents/knowledge-base/[baseId]/web-crawler/actions";
import { SelectPagesDialog } from "@/components/knowledge/select-pages-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CRAWL_MODES, normalizeUrl } from "@/lib/knowledge/crawl";
import type { CrawlMode } from "@/types/database";

/**
 * Pointing the crawler at a website.
 *
 * Two fields, and the first one is the one that matters: "just this page" and
 * "the whole site" are wildly different amounts of work and wildly different
 * knowledge bases, and a crawler that guesses gets it wrong in whichever
 * direction is most annoying. The hint under the mode is there because the
 * three labels alone do not distinguish path from domain for anybody who has
 * not thought about it before.
 *
 * ## What happens on submit depends on the mode
 *
 * Exact URL is one page and there is nothing to choose, so it is trained
 * straight away. The other two find out what the site has and hand over to the
 * picker — because "all URLs in this domain" is a promise nobody can check
 * before it runs, and the pages worth training on are almost never all of
 * them. Discovery writes nothing, so backing out of the picker leaves no trace.
 *
 * The address is checked here as well as on the server. Not for safety -- the
 * actions normalise it again, and have to, since this can be bypassed -- but
 * because "that doesn't look like a web address" is worth saying before a
 * fetch has been attempted against it.
 */
export function AddWebsiteDialog({
  baseId,
  open,
  onOpenChange,
  onAdded,
}: {
  baseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new source so the panel can start crawling it. */
  onAdded: (sourceId: string) => void;
}) {
  const [pending, startTransition] = useTransition();

  const [mode, setMode] = useState<CrawlMode>("exact");
  const [url, setUrl] = useState("");

  /** The picker's list, and the fact that the picker is open at all. */
  const [discovery, setDiscovery] = useState<Discovery | null>(null);

  const normalized = normalizeUrl(url);
  const looksWrong = url.trim().length > 0 && normalized === null;

  const chosen = CRAWL_MODES.find((option) => option.value === mode);

  function reset() {
    setMode("exact");
    setUrl("");
    setDiscovery(null);
  }

  /** Writes the source and hands the panel over to the crawl loop. */
  async function add(urls?: string[]) {
    const result = await addWebsite(baseId, { url, mode, urls });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    onOpenChange(false);
    reset();
    onAdded(result.value.sourceId);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      if (mode === "exact") {
        await add();
        return;
      }

      const found = await discoverPages({ url, mode });

      if (!found.ok) {
        toast.error(found.error);
        return;
      }

      if (found.value.urls.length === 0) {
        toast.error(
          "Nothing was found under that address. Try Exact URL, or a page higher up the site.",
        );
        return;
      }

      setDiscovery(found.value);
    });
  }

  return (
    <>
      <Dialog
        // Kept mounted but hidden behind the picker, so cancelling out of the
        // picker returns to the mode and address already typed rather than to
        // an empty form.
        open={open && !discovery}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add website</DialogTitle>
            <DialogDescription>
              Crawl and extract content from a website to train your bot.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="crawl-mode" className="text-xs">
                  Select mode
                </Label>
                <Select
                  value={mode}
                  onValueChange={(value) => setMode(value as CrawlMode)}
                >
                  <SelectTrigger id="crawl-mode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRAWL_MODES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="crawl-url" className="text-xs">
                  Enter URL
                </Label>
                <Input
                  id="crawl-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="voltascales.com"
                  inputMode="url"
                  aria-invalid={looksWrong || undefined}
                  autoFocus
                />
              </div>
            </div>

            <p className="text-muted-foreground text-xs leading-relaxed">
              {looksWrong ? (
                <span className="text-destructive">
                  That doesn&apos;t look like a web address.
                </span>
              ) : mode === "exact" ? (
                chosen?.hint
              ) : (
                `${chosen?.hint} You'll pick which of them to train before anything is crawled.`
              )}
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending || !normalized}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {mode === "exact" ? "Train this page" : "Find pages"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {discovery && (
        <SelectPagesDialog
          discovery={discovery}
          rootUrl={normalized ?? url}
          onCancel={() => setDiscovery(null)}
          onRediscover={async () => {
            const found = await discoverPages({ url, mode, force: "crawl" });

            if (!found.ok) {
              toast.error(found.error);
              return;
            }

            setDiscovery(found.value);
          }}
          onTrain={(urls) => add(urls)}
        />
      )}
    </>
  );
}
