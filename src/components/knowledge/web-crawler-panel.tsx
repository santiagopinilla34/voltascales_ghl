"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  crawlNextPage,
  deleteWebPage,
  deleteWebSource,
  recrawlPage,
} from "@/app/(app)/ai-agents/knowledge-base/[baseId]/web-crawler/actions";
import { AddWebsiteDialog } from "@/components/knowledge/add-website-dialog";
import { ScrapedDataDialog } from "@/components/knowledge/scraped-data-dialog";
import { useOpenOnArrival } from "@/hooks/use-open-on-arrival";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatFullTimestamp } from "@/lib/format";
import { displayPath } from "@/lib/knowledge/crawl";
import type { WebPageRow } from "@/lib/knowledge/web-queries";
import { cn } from "@/lib/utils";
import type { KnowledgeWebSource } from "@/types/database";

/**
 * The Web crawler tab: the websites feeding this base, and every page they
 * produced.
 *
 * ## The crawl runs from here
 *
 * `addWebsite` reads the starting page and works out how many URLs are in
 * scope, then stops. This component picks up any source that is not finished
 * and calls `crawlNextPage` in a loop — one page per call, each returning the
 * new totals, until the source says it is done.
 *
 * That is why the bars move honestly: each step is a page that actually
 * landed in Postgres, not a timer easing a bar towards a number. It also
 * bounds every request to about one fetch, so nothing is killed halfway
 * through a forty-page site, and a crawl interrupted by a closed tab is picked
 * up again the next time this screen is opened — the pending rows are still
 * there, and the loop below finds them.
 *
 * Auto-refresh is the switch on that loop. On, the crawl runs and the screen
 * keeps itself in step; off, it stops where it is and offers to resume. Worth
 * having as a control rather than a status, because "stop crawling my whole
 * site" is a thing people want at about page thirty.
 *
 * ## Why the two bars are not the same bar
 *
 * Crawling counts pages attempted; training counts pages whose text came back
 * and was stored. A page that 404s or times out moves the first and not the
 * second, which is the only way the screen can say "I read forty pages and
 * thirty-nine of them worked" — and that is exactly the thing worth knowing
 * before an agent starts answering from it.
 */

export function WebCrawlerPanel({
  baseId,
  sources,
  pages,
}: {
  baseId: string;
  sources: KnowledgeWebSource[];
  pages: WebPageRow[];
}) {
  const router = useRouter();

  // Seeded from `?add=1`, which is what the plus on the All tab's Web crawler
  // card links to.
  const [adding, setAdding] = useOpenOnArrival();
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(true);

  // Read inside the loop, which outlives the render that started it. Reading
  // `autoRun` there would see whatever it was when the loop began, so pausing
  // would not take effect until the current source finished — which is the one
  // moment pausing is for.
  const autoRunRef = useRef(autoRun);
  useEffect(() => {
    autoRunRef.current = autoRun;
  }, [autoRun]);

  // Which sources this component is already driving. Without it, every render
  // caused by the loop's own `router.refresh()` would start a second loop on
  // the same source.
  const driving = useRef<Set<string>>(new Set());

  /** Live totals, so the bars move between server renders. */
  const [live, setLive] = useState<
    Record<string, { crawled: number; found: number }>
  >({});

  /**
   * Rows the crawl has finished since the last server render, laid over the
   * table below.
   *
   * The alternative — revalidate on the server and refresh after each page —
   * does not work here: every refresh is superseded by the next
   * `crawlNextPage` before it lands, so the rows stay at Queued for the whole
   * crawl and then all flip at once. The action hands back the row it wrote
   * instead, which is live, exact, and cheaper than refetching the tree once
   * per page.
   */
  const [livePages, setLivePages] = useState<
    Record<
      string,
      { status: "trained" | "failed"; word_count: number; error: string | null; updated_at: string }
    >
  >({});

  const drive = useCallback(
    async (sourceId: string) => {
      try {
        for (;;) {
          if (!autoRunRef.current) break;

          const result = await crawlNextPage(sourceId);

          if (!result.ok) {
            toast.error(result.error);
            break;
          }

          setLive((current) => ({
            ...current,
            [sourceId]: {
              crawled: result.value.crawled,
              found: result.value.found,
            },
          }));

          const page = result.value.page;
          if (page) {
            setLivePages((current) => ({
              ...current,
              [page.id]: {
                status: page.status,
                word_count: page.wordCount,
                error: page.error,
                updated_at: page.updatedAt,
              },
            }));
          }

          if (result.value.done) break;
        }
      } finally {
        driving.current.delete(sourceId);
        router.refresh();
      }
    },
    [router],
  );

  useEffect(() => {
    if (!autoRun) return;

    for (const source of sources) {
      if (source.status !== "queued" && source.status !== "crawling") continue;
      if (driving.current.has(source.id)) continue;

      driving.current.add(source.id);
      void drive(source.id);
    }
  }, [sources, autoRun, drive]);

  /**
   * The server's rows with anything the running crawl has since written laid
   * over them. Everything below reads this rather than `pages`.
   */
  const merged = useMemo(
    () =>
      pages.map((page) => {
        const patch = livePages[page.id];
        return patch ? { ...page, ...patch } : page;
      }),
    [pages, livePages],
  );

  /** Pages that came back with text, per source — the training numerator. */
  const trainedBySource = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const page of merged) {
      if (page.status !== "trained") continue;
      counts[page.source_id] = (counts[page.source_id] ?? 0) + 1;
    }
    return counts;
  }, [merged]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return merged;
    return merged.filter((page) => page.url.toLowerCase().includes(needle));
  }, [merged, query]);

  /**
   * The ticked rows the current search actually shows.
   *
   * Bulk actions run over this rather than over `selected`, and the header
   * checkbox counts against it. Ticking three rows and then typing in the
   * search box would otherwise leave the bar offering to delete pages that are
   * no longer on screen — and the select-every-page box, which only ever ticks
   * what is shown, could never reach a full state once a filter was on.
   */
  const selectedShown = useMemo(
    () => shown.filter((page) => selected.has(page.id)).map((page) => page.id),
    [shown, selected],
  );

  const crawling = sources.some(
    (source) => source.status === "queued" || source.status === "crawling",
  );

  function run(key: string, work: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    void work()
      .then((result) => {
        if (!result.ok && result.error) toast.error(result.error);
        else router.refresh();
      })
      .finally(() => setBusy(null));
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Applies one of the row actions to everything ticked.
   *
   * One at a time rather than in parallel: each of these also adjusts its
   * source's counters, and two of those racing on the same source is how the
   * bar ends up saying 3 of 5 when there are four pages left.
   *
   * Stops at the first failure and keeps the selection, so the bar still holds
   * what did not get done and the toast is about one page rather than about
   * forty. The rows that did succeed are already gone from the refresh.
   */
  async function runBulk(
    ids: string[],
    each: (id: string) => Promise<{ ok: boolean; error?: string }>,
  ) {
    if (ids.length === 0) return;
    setBusy("bulk");

    let failed = false;
    for (const id of ids) {
      const result = await each(id);
      if (!result.ok) {
        if (result.error) toast.error(result.error);
        failed = true;
        break;
      }
    }

    if (!failed) setSelected(new Set());
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight">URLs</h3>
          <Badge variant="secondary" className="tabular-nums">
            {pages.length}
          </Badge>

          {crawling && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoRun((on) => !on)}
            >
              {autoRun ? (
                <>
                  <Pause className="size-3.5" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="size-3.5" />
                  Resume
                </>
              )}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {pages.length > 0 && (
            <div className="relative w-full sm:w-56">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search crawled pages"
                className="h-8 pl-8"
              />
            </div>
          )}

          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            Add website
          </Button>
        </div>
      </div>

      {sources.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          trained={trainedBySource[source.id] ?? 0}
          live={live[source.id]}
          busy={busy === source.id}
          onRemove={() =>
            run(source.id, () => deleteWebSource(source.id))
          }
        />
      ))}

      {pages.length === 0 ? (
        <EmptyState onAdd={() => setAdding(true)} hasSource={sources.length > 0} />
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-12 text-center text-sm">
          Nothing matches “{query}”.
        </p>
      ) : (
        <>
          {selectedShown.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy === "bulk"}
                  >
                    {busy === "bulk" && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    Bulk actions
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onSelect={() =>
                      void runBulk(selectedShown, (id) => recrawlPage(id))
                    }
                  >
                    <RefreshCw className="size-3.5" />
                    Crawl again
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() =>
                      void runBulk(selectedShown, (id) => deleteWebPage(id))
                    }
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <span className="text-muted-foreground text-xs tabular-nums">
                {selectedShown.length} of {shown.length} selected
              </span>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                <X className="size-3.5" />
                Cancel
              </Button>
            </div>
          )}

          <div className="flex flex-col rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select every page"
                      checked={
                        selectedShown.length === 0
                          ? false
                          : selectedShown.length === shown.length
                            ? true
                            : "indeterminate"
                      }
                      onCheckedChange={(next) =>
                        setSelected(
                          next === true
                            ? new Set(shown.map((page) => page.id))
                            : new Set(),
                        )
                      }
                    />
                  </TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="hidden w-44 sm:table-cell">
                    Updated at
                  </TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
  
              <TableBody>
                {shown.map((page) => (
                  <TableRow key={page.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${page.url}`}
                        checked={selected.has(page.id)}
                        onCheckedChange={() => toggle(page.id)}
                      />
                    </TableCell>
  
                    <TableCell className="max-w-0">
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary block truncate text-sm hover:underline"
                        title={page.url}
                      >
                        {displayPath(page.url)}
                      </a>
                      {page.error && (
                        <span className="text-destructive block truncate text-xs">
                          {page.error}
                        </span>
                      )}
                    </TableCell>
  
                    <TableCell>
                      <PageStatus status={page.status} words={page.word_count} />
                    </TableCell>
  
                    <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
                      {formatFullTimestamp(page.updated_at)}
                    </TableCell>
  
                    <TableCell>
                      <span className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`View the text scraped from ${page.url}`}
                          title="View scraped data"
                          disabled={page.status === "pending"}
                          onClick={() => setViewing(page.id)}
                        >
                          <FileText className="size-3.5" />
                        </Button>
  
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Crawl ${page.url} again`}
                          title="Crawl again"
                          disabled={busy === page.id}
                          onClick={() =>
                            run(page.id, () => recrawlPage(page.id))
                          }
                        >
                          {busy === page.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                        </Button>
  
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${page.url}`}
                          title="Delete"
                          onClick={() =>
                            run(`del-${page.id}`, () => deleteWebPage(page.id))
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AddWebsiteDialog
        baseId={baseId}
        open={adding}
        onOpenChange={setAdding}
        onAdded={() => {
          // The new source arrives with the refresh; the effect above sees it
          // is unfinished and starts crawling.
          setAutoRun(true);
          router.refresh();
        }}
      />

      {viewing && (
        <ScrapedDataDialog
          key={viewing}
          pageId={viewing}
          onOpenChange={(open) => !open && setViewing(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

/** One website, with how far its crawl has got. */
function SourceCard({
  source,
  trained,
  live,
  busy,
  onRemove,
}: {
  source: KnowledgeWebSource;
  trained: number;
  live?: { crawled: number; found: number };
  busy: boolean;
  onRemove: () => void;
}) {
  const failed = source.status === "failed";
  const done = source.status === "trained";

  // The live totals win *only* while the crawl is still running, where they are
  // a page ahead of whatever the last server render captured. Once it has
  // finished they are the wrong answer and stay wrong: they are the last thing
  // the loop saw, so deleting a page afterwards left the card insisting there
  // were still fourteen while the row underneath said thirteen.
  const running = !failed && !done;
  const found = (running ? live?.found : undefined) ?? source.pages_found;
  const crawled = (running ? live?.crawled : undefined) ?? source.pages_crawled;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border px-3 py-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          failed
            ? "bg-destructive/10 text-destructive"
            : done
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
        )}
      >
        {failed ? (
          <TriangleAlert className="size-4" />
        ) : done ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <Link2 className="size-4" />
        )}
      </span>

      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{source.url}</span>
          <Badge variant={failed ? "destructive" : done ? "secondary" : "outline"}>
            {failed ? "Failed" : done ? "Trained" : "In progress"}
          </Badge>
        </div>

        <p className="text-muted-foreground truncate text-xs">
          {failed
            ? (source.error ?? "The site could not be read.")
            : done
              ? `Trained ${trained} of ${found} pages`
              : `Crawling ${crawled} of ${found} pages`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <Meter label="Crawling" value={crawled} total={found} tone="crawl" />
        <Meter label="Training" value={trained} total={found} tone="train" />
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label={`Remove ${source.url}`}
        title="Remove this website and its pages"
        disabled={busy}
        onClick={onRemove}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
      </Button>
    </div>
  );
}

/** One labelled progress bar. */
function Meter({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "crawl" | "train";
}) {
  // A crawl with nothing found yet is at nought, not at NaN.
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="w-28">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-xs tabular-nums">
          {value}
          <span className="text-muted-foreground">/{total}</span>
        </span>
      </div>
      <div className="bg-muted mt-1 h-1 overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            tone === "crawl" ? "bg-foreground/60" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** A page's state, and how much came off it. */
function PageStatus({ status, words }: { status: string; words: number }) {
  if (status === "pending") {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <Loader2 className="size-3 animate-spin" />
        Queued
      </span>
    );
  }

  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }

  return (
    <span className="flex flex-col gap-0.5">
      <Badge variant="secondary" className="w-fit">
        Trained
      </Badge>
      <span className="text-muted-foreground text-[0.6875rem] tabular-nums">
        {words} words
      </span>
    </span>
  );
}

/** Nothing crawled yet. */
function EmptyState({
  onAdd,
  hasSource,
}: {
  onAdd: () => void;
  hasSource: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-16 text-center">
      <BrowserIllustration />

      <p className="text-sm font-medium">
        {hasSource ? "Nothing came back from that website" : "No websites added yet"}
      </p>

      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        {hasSource
          ? "The crawl finished without a readable page. Check the address, or try the exact URL of a page you know has text on it."
          : "Add a website to start building your knowledge base."}
      </p>

      <div className="pt-1">
        <Button size="sm" onClick={onAdd}>
          <Plus className="size-3.5" />
          Add website
        </Button>
      </div>
    </div>
  );
}

/**
 * A browser window with nothing in it.
 *
 * Inline rather than a file: it is drawn from four rectangles and three dots,
 * and an asset would mean a second thing to keep in step with the theme. Every
 * stroke and fill is `currentColor`, so it takes the muted foreground of
 * whichever theme is on rather than carrying its own greys.
 */
function BrowserIllustration() {
  return (
    <svg
      viewBox="0 0 160 128"
      className="text-muted-foreground/40 h-24 w-auto"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="0.75"
        y="0.75"
        width="158.5"
        height="126.5"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M0.75 20.5H159.25" stroke="currentColor" strokeWidth="1.5" />

      <circle cx="13" cy="10.5" r="2.5" fill="currentColor" />
      <circle cx="22" cy="10.5" r="2.5" fill="currentColor" />
      <circle cx="31" cy="10.5" r="2.5" fill="currentColor" />

      <rect
        x="14.75"
        y="32.75"
        width="130.5"
        height="24.5"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
      />

      <rect x="14" y="65" width="112" height="3" rx="1.5" fill="currentColor" />
      <rect x="14" y="72" width="74" height="3" rx="1.5" fill="currentColor" />

      <rect
        x="14.75"
        y="86.75"
        width="39.5"
        height="23.5"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="62.75"
        y="86.75"
        width="39.5"
        height="23.5"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="110.75"
        y="86.75"
        width="39.5"
        height="23.5"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
      />

      <rect x="14" y="116" width="34" height="3" rx="1.5" fill="currentColor" />
      <rect x="62" y="116" width="34" height="3" rx="1.5" fill="currentColor" />
      <rect
        x="110"
        y="116"
        width="34"
        height="3"
        rx="1.5"
        fill="currentColor"
      />
    </svg>
  );
}
