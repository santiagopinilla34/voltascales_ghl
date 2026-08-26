"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Copy, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import type { Discovery } from "@/app/(app)/ai-agents/knowledge-base/[baseId]/web-crawler/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { MAX_PAGES_PER_SOURCE } from "@/lib/knowledge/crawl";
import { cn } from "@/lib/utils";

/**
 * Which of a site's pages to actually train on.
 *
 * The step this replaces was "all URLs in this domain, go", which is wrong
 * about most sites in the same way every time: the pages worth training on are
 * a handful, and the rest are an archive, a staging copy, or forty blog posts
 * from 2019. Deciding that is a person's job and takes them about ten seconds
 * once they can see the list — so the crawl now stops and shows them the list.
 *
 * Nothing has been written when this opens. Cancelling leaves no source, no
 * rows and no half-finished crawl, which is the reason discovery is a separate
 * action from adding.
 *
 * ## Paging a list that is already in memory
 *
 * Every URL is here, on the client, from one action. The pager is therefore
 * about how much to *look* at rather than how much to fetch — which is why
 * ticking a box on page one and moving to page two keeps the tick, and why
 * "select all" means all of them and not all ten on screen. Both would be
 * lies if the pages were coming from the server one at a time, and both are
 * what somebody expects when the list is a list.
 */

const PAGE_SIZES = [10, 25, 50, 100];

export function SelectPagesDialog({
  discovery,
  rootUrl,
  onCancel,
  onRediscover,
  onTrain,
}: {
  discovery: Discovery;
  /** What was typed, for the empty case's wording. */
  rootUrl: string;
  onCancel: () => void;
  /** Runs discovery again, following links instead of the sitemap. */
  onRediscover: () => Promise<void>;
  onTrain: (urls: string[]) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [rediscovering, setRediscovering] = useState(false);

  const [query, setQuery] = useState("");
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return discovery.urls;
    return discovery.urls.filter((url) => url.toLowerCase().includes(needle));
  }, [discovery.urls, query]);

  const pageCount = Math.max(1, Math.ceil(matches.length / size));
  // Clamped rather than reset: narrowing the search while on page four should
  // land on the last page of what is left, not silently on page one of it.
  const current = Math.min(page, pageCount);
  const visible = matches.slice((current - 1) * size, current * size);

  /**
   * How many may be ticked here, and why.
   *
   * Two ceilings meet at this number: what is left of the organization's page
   * limit, and the fifty-per-website cap. Reporting only the one that happens
   * to bite would tell somebody at 995 pages that they may add fifty more.
   */
  const room = Math.max(0, discovery.limit - discovery.used);
  const selectable = Math.min(discovery.selectable, discovery.urls.length);
  const cappedByLimit = room < MAX_PAGES_PER_SOURCE;

  const allSelected =
    discovery.urls.length > 0 && selected.size === discovery.urls.length;
  const overLimit = selected.size > discovery.selectable;

  function toggle(url: string) {
    setSelected((currentSet) => {
      const next = new Set(currentSet);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  /**
   * Ticks everything there is room for, in the order the site listed them.
   *
   * Capped rather than refused. Somebody with room for twenty on a
   * fifty-page site means "as much as I can have", and ticking twenty and
   * saying so is a better answer than ticking fifty and disabling the button
   * they were reaching for.
   */
  function selectAll() {
    const take = discovery.urls.slice(0, selectable);
    setSelected(new Set(take));

    if (take.length < discovery.urls.length) {
      toast.info(
        `Selected the first ${take.length} — that's all there's room for.`,
      );
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied(null), 1200);
    } catch {
      toast.error("Couldn't copy that — the browser refused clipboard access.");
    }
  }

  function train() {
    startTransition(async () => {
      await onTrain([...selected]);
    });
  }

  async function rediscover() {
    setRediscovering(true);
    try {
      await onRediscover();
      setSelected(new Set());
      setPage(1);
    } finally {
      setRediscovering(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select pages to train</DialogTitle>
          <DialogDescription>
            {discovery.via === "sitemap"
              ? "Pick the pages you want to train. This is the fastest, most precise way."
              : "Followed the links on that page. Pick the ones worth training on."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-medium">
            {discovery.via === "sitemap" ? "Sitemap found" : "Links found"} —{" "}
            {discovery.urls.length} page
            {discovery.urls.length === 1 ? "" : "s"}
          </p>

          <div className="text-right">
            <p
              className={cn(
                "text-xs tabular-nums",
                overLimit ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {selected.size} selected of {selectable} available
            </p>
            {discovery.firecrawl ? (
              <p
                className="text-muted-foreground text-xs tabular-nums"
                title="Counted from what Firecrawl has actually billed, so pages you have since deleted still count. Pages that answered with plain HTML were read without Firecrawl and cost nothing, so the real figure is a little higher. The count runs by calendar month; the plan's allowance renews on its own subscription date."
              >
                {discovery.firecrawl.pagesCrawled.toLocaleString()} of{" "}
                {discovery.firecrawl.pagesAllowed.toLocaleString()} pages
                crawled
                {renewal(discovery.firecrawl.resetsOn)}
              </p>
            ) : (
              <p
                className="text-muted-foreground text-xs tabular-nums"
                title="Firecrawl's usage could not be read, so this counts the pages this organization currently stores instead."
              >
                {discovery.used.toLocaleString()} of{" "}
                {discovery.limit.toLocaleString()} pages stored
              </p>
            )}
          </div>
        </div>

        {overLimit && (
          <p className="text-destructive text-xs">
            {room === 0
              ? `You're at the limit of ${discovery.limit.toLocaleString()} pages. Delete some before adding more.`
              : cappedByLimit
                ? `Only ${room} page${room === 1 ? "" : "s"} left before the limit of ${discovery.limit.toLocaleString()}. Untick ${selected.size - room}, or delete pages you no longer need.`
                : `${MAX_PAGES_PER_SOURCE} is the most one website may add. Untick ${selected.size - MAX_PAGES_PER_SOURCE}.`}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search pages…"
              aria-label="Search discovered pages"
              className="h-8 pl-8"
            />
          </div>

          <Label className="flex shrink-0 items-center gap-2 text-xs font-normal">
            <Checkbox
              checked={allSelected}
              disabled={selectable === 0}
              onCheckedChange={(next) =>
                next === true ? selectAll() : setSelected(new Set())
              }
            />
            Select all {selectable < discovery.urls.length ? selectable : discovery.urls.length}
          </Label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
          {visible.length === 0 ? (
            <p className="text-muted-foreground px-4 py-12 text-center text-sm">
              Nothing matches “{query}”.
            </p>
          ) : (
            <ul>
              {visible.map((url, index) => {
                const number = (current - 1) * size + index + 1;
                const isSelected = selected.has(url);

                return (
                  <li
                    key={url}
                    className={cn(
                      "flex items-center gap-3 border-b px-3 py-2 last:border-b-0",
                      isSelected && "bg-accent/50",
                    )}
                  >
                    <span className="text-muted-foreground w-6 shrink-0 text-right text-xs tabular-nums">
                      {number}
                    </span>

                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(url)}
                      aria-label={`Train ${url}`}
                    />

                    {/* A label rather than a link: the row's job is to be
                        ticked, and a click that opened the page in a new tab
                        every time you aimed slightly wrong would be maddening.
                        The copy button is there for when you do want the URL. */}
                    <label className="min-w-0 flex-1 cursor-pointer truncate text-sm">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isSelected}
                        onChange={() => toggle(url)}
                      />
                      {url}
                    </label>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      aria-label={`Copy ${url}`}
                      title="Copy this address"
                      onClick={() => copy(url)}
                    >
                      {copied === url ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Label className="flex items-center gap-2 text-xs font-normal">
            Rows per page
            <Select
              value={String(size)}
              onValueChange={(value) => {
                setSize(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger size="sm" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs tabular-nums">
              {matches.length === 0
                ? "0 of 0"
                : `${(current - 1) * size + 1}–${Math.min(current * size, matches.length)} of ${matches.length}`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={current >= pageCount}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        </div>

        {discovery.via === "sitemap" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-medium">Page missing from this list?</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Sitemaps don&apos;t always list every page. Discovering by
                crawling follows the links on {rootUrl} instead — slower, and it
                only finds what something links to.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={rediscovering || pending}
              onClick={rediscover}
            >
              {rediscovering && <Loader2 className="size-3.5 animate-spin" />}
              Discover by crawling
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={train}
            disabled={pending || selected.size === 0 || overLimit}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Train selected
            {selected.size > 0 && ` (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * " · resets 1 Sep", or nothing at all.
 *
 * A count without the date it goes back to nought is half a fact — it is the
 * half that decides whether somebody ticks forty boxes now or waits a week.
 * Day and month only: the year is either this one or the reader has larger
 * problems, and this sits in a 12px line under another number.
 *
 * Formatted in UTC because the stamp is a UTC month boundary. Rendering it in
 * Toronto time would move midnight on the 1st back to 8 p.m. on the 31st and
 * print a reset date a day early.
 *
 * Returns an empty string for a missing or unparseable stamp rather than
 * throwing or printing "Invalid Date" — the count beside it still stands on
 * its own.
 */
function renewal(resetsOn: string | null): string {
  if (!resetsOn) return "";

  const at = new Date(resetsOn);
  if (Number.isNaN(at.getTime())) return "";

  const on = new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(at);

  return ` · resets ${on}`;
}
