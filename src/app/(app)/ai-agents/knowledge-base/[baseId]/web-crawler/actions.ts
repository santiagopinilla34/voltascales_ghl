"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/ai-agents/knowledge-base/actions";
import {
  MAX_PAGES_PER_SOURCE,
  ORG_PAGE_LIMIT,
  countWords,
  isInScope,
  looksLikeAPage,
  normalizeUrl,
} from "@/lib/knowledge/crawl";
import { fetchPage, fetchSitemapUrls } from "@/lib/knowledge/extract";
import { countWebPages, getWebPage } from "@/lib/knowledge/web-queries";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";
import type { CrawlMode } from "@/types/database";

/**
 * Adding a website, and reading it one page at a time.
 *
 * ## Why the crawl is a loop the browser drives
 *
 * The obvious shape is one action that crawls the whole site and returns when
 * it is done, and it is wrong twice. A forty-page site takes longer than a
 * request is allowed to live, so it would be killed halfway with nothing
 * stored; and even where it survived, the screen would sit still for a minute
 * and then jump to finished, which is the one thing the progress bars on the
 * card exist to avoid.
 *
 * So it is three steps. `discoverPages` reads what a site has and writes
 * nothing, so the picker can show a list and somebody can walk away from it
 * without leaving a half-made crawl behind. `addWebsite` writes the ticked
 * URLs as pending rows. Then the browser calls `crawlNextPage` over and over,
 * and each call fetches exactly one page, stores its text and answers with the
 * new totals. The bars move because pages landed. Closing the tab halfway
 * leaves a resumable crawl rather than a lost one, because everything it got
 * to is already in Postgres.
 *
 * ## Org scope
 *
 * Only the inserts name an organization, because a new row has no organization
 * until it is given one. Every read, update and delete leaves it to RLS, whose
 * policies resolve the organization from the session -- so a page id belonging
 * to another tenant matches nothing here rather than being caught by a check.
 */

const PATH = "/ai-agents/knowledge-base";

/** Revalidates the whole base, since a crawl changes the tab and the count. */
function refresh() {
  revalidatePath(PATH, "layout");
}

function describe(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "That website is already on this knowledge base.";
  }
  return error.message;
}

/** The message to store on a row that could not be read. */
function reason(error: unknown): string {
  if (error instanceof Error) {
    // `AbortSignal.timeout` throws a TimeoutError whose message is the useless
    // "signal timed out"; everything else already says something.
    return error.name === "TimeoutError"
      ? "The site took too long to answer."
      : error.message;
  }
  return "The page could not be read.";
}

export type Discovery = {
  /** Where the list came from, which the picker says out loud. */
  via: "sitemap" | "crawl";
  /** In-scope URLs, ready to be ticked. */
  urls: string[];
  /** How many the site offered before the mode's scope was applied. */
  total: number;
  /** Crawled pages this organization already holds, across every base. */
  used: number;
  /** The ceiling those count against. */
  limit: number;
  /**
   * The most that may be ticked here: what is left of the limit, or the
   * per-website cap, whichever bites first.
   *
   * Computed on the server so the picker cannot be the only thing that knows
   * it. `addWebsite` recomputes it from a fresh count before writing — the two
   * are minutes apart in a slow crawl, and another tab may have used the room
   * in between.
   */
  selectable: number;
};

/**
 * The pages a website has, without crawling any of them.
 *
 * Read before anything is written, so the picker can open on a list rather
 * than on a spinner over an already-committed crawl. Nothing here touches the
 * database: choosing not to train any of it should leave no trace.
 *
 * The sitemap is tried first and link-following is the fallback, because a
 * sitemap is the site describing its own contents -- it lists pages nothing
 * links to, and reading it is one request rather than one per page. `via` says
 * which happened, and the picker offers the fallback by hand when the sitemap
 * turned out to be missing a page somebody knows is there.
 */
export async function discoverPages(
  input: { url: string; mode: CrawlMode; force?: "crawl" },
): Promise<ActionResult<Discovery>> {
  const url = normalizeUrl(input.url);
  if (!url) {
    return { ok: false, error: "That doesn't look like a web address." };
  }

  const inScope = (candidate: string) =>
    isInScope(candidate, url, input.mode) && looksLikeAPage(candidate);

  const supabase = await createClient();
  const used = await countWebPages(supabase);
  const budget = {
    used,
    limit: ORG_PAGE_LIMIT,
    selectable: Math.max(0, Math.min(MAX_PAGES_PER_SOURCE, ORG_PAGE_LIMIT - used)),
  };

  if (input.force !== "crawl") {
    const sitemap = await fetchSitemapUrls(url);

    if (sitemap) {
      const scoped = sitemap.filter(inScope);

      // A sitemap that lists nothing inside the chosen scope is not a usable
      // answer -- it is a reason to fall through to crawling, not to show an
      // empty picker.
      if (scoped.length > 0) {
        return {
          ok: true,
          value: {
            via: "sitemap",
            urls: scoped,
            total: sitemap.length,
            ...budget,
          },
        };
      }
    }
  }

  try {
    const page = await fetchPage(url);
    const links = page.links.filter(inScope);

    return {
      ok: true,
      value: {
        // The starting page first and always, since it is the one the person
        // actually typed.
        urls: [url, ...links.filter((link) => link !== url)],
        via: "crawl",
        total: page.links.length,
        ...budget,
      },
    };
  } catch (error) {
    return { ok: false, error: reason(error) };
  }
}

/**
 * Adds a website to a base and queues the pages chosen for it.
 *
 * Nothing is fetched here. Every page starts pending and the browser's loop
 * reads them one at a time, including the first -- which keeps this action
 * short enough that the dialog closes immediately, and means an unreachable
 * starting page fails as a row that says why rather than as a toast that
 * vanishes.
 *
 * `urls` is what came back ticked from the picker. Exact mode has no picker,
 * so it falls back to the one URL that was typed.
 */
export async function addWebsite(
  baseId: string,
  input: { url: string; mode: CrawlMode; urls?: string[] },
): Promise<ActionResult<{ sourceId: string }>> {
  const url = normalizeUrl(input.url);
  if (!url) {
    return { ok: false, error: "That doesn't look like a web address." };
  }

  const chosen = (
    input.mode === "exact" || !input.urls?.length ? [url] : input.urls
  )
    .map((candidate) => normalizeUrl(candidate))
    .filter((candidate): candidate is string => candidate !== null);

  // Re-checked here rather than trusted from the browser: this action is
  // reachable without the picker, and "train these forty URLs on somebody
  // else's domain" is not a thing the mode should allow.
  const scoped = [...new Set(chosen)]
    .filter((candidate) => isInScope(candidate, url, input.mode))
    .slice(0, MAX_PAGES_PER_SOURCE);

  if (scoped.length === 0) {
    return { ok: false, error: "None of those pages are on that site." };
  }

  const context = await requireOrgContext();
  const supabase = await createClient();

  // Counted here rather than taken from the picker, for the same reason the
  // knowledge base limit is counted in its action: the browser knows how many
  // pages there were when the dialog opened, which is not the same as how many
  // there are now. A crawl running in another tab, or a long look at the list,
  // is enough to make the two disagree.
  const used = await countWebPages(supabase);
  const room = ORG_PAGE_LIMIT - used;

  if (room <= 0) {
    return {
      ok: false,
      error: `You're at the limit of ${ORG_PAGE_LIMIT.toLocaleString()} crawled pages. Delete some pages to make room.`,
    };
  }

  if (scoped.length > room) {
    return {
      ok: false,
      error: `That's ${scoped.length} pages and there is only room for ${room}. Untick a few, or delete pages you no longer need.`,
    };
  }

  const { data: source, error: insertError } = await supabase
    .from("knowledge_web_sources")
    .insert({
      org_id: context.orgId,
      base_id: baseId,
      url,
      mode: input.mode,
      status: "queued",
      pages_found: scoped.length,
      pages_crawled: 0,
    })
    .select("id")
    .single();

  if (insertError) return { ok: false, error: describe(insertError) };

  const { error: pagesError } = await supabase
    .from("knowledge_web_pages")
    .insert(
      scoped.map((pageUrl) => ({
        org_id: context.orgId,
        base_id: baseId,
        source_id: source.id,
        url: pageUrl,
        status: "pending" as const,
      })),
    );

  if (pagesError) {
    // A source with no pages would sit on the screen for ever at nought of
    // nought, and there is nothing to resume. Take it back out.
    await supabase.from("knowledge_web_sources").delete().eq("id", source.id);
    return { ok: false, error: pagesError.message };
  }

  refresh();
  return { ok: true, value: { sourceId: source.id } };
}

/**
 * What one step of a crawl did, in enough detail to redraw the row.
 *
 * The page's new state is returned rather than left to be picked up by a
 * refetch of the whole screen. `revalidatePath` plus `router.refresh()` looked
 * like the tidier answer and did not work: each refresh was superseded by the
 * next `crawlNextPage` before it landed, so every row sat at Queued until the
 * crawl ended and then flipped together. Handing back the one row that changed
 * is both correct and cheaper than refetching the tree once per page.
 */
export type CrawlProgress = {
  /** Nothing left to fetch — the browser stops calling. */
  done: boolean;
  crawled: number;
  found: number;
  /** The row just written, or null when there was nothing left to do. */
  page: {
    id: string;
    url: string;
    status: "trained" | "failed";
    wordCount: number;
    error: string | null;
    updatedAt: string;
  } | null;
};

/**
 * Reads exactly one pending page of a source and reports where that leaves it.
 *
 * One page per call is the point. It bounds how long the request takes to
 * roughly one fetch, so nothing is ever killed mid-crawl, and it makes the
 * progress on the card a fact rather than an animation.
 *
 * A page that cannot be read is marked failed and still counts as crawled.
 * Otherwise one dead link would leave the bar one short of full for ever and
 * the browser calling this in a loop that never ends.
 */
export async function crawlNextPage(
  sourceId: string,
): Promise<ActionResult<CrawlProgress>> {
  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("knowledge_web_sources")
    .select("id, url, pages_found, pages_crawled, status")
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceError) return { ok: false, error: sourceError.message };
  if (!source) return { ok: false, error: "That website is no longer here." };

  const { data: next, error: nextError } = await supabase
    .from("knowledge_web_pages")
    .select("id, url")
    .eq("source_id", sourceId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextError) return { ok: false, error: nextError.message };

  if (!next) {
    // Nothing pending. Settle the source, in case a previous run was
    // interrupted between the last page and this update.
    if (source.status !== "trained") {
      await supabase
        .from("knowledge_web_sources")
        .update({ status: "trained", updated_at: new Date().toISOString() })
        .eq("id", sourceId);
      refresh();
    }

    return {
      ok: true,
      value: {
        done: true,
        crawled: source.pages_crawled,
        found: source.pages_found,
        page: null,
      },
    };
  }

  const now = new Date().toISOString();
  let result: CrawlProgress["page"];

  try {
    const page = await fetchPage(next.url);
    const words = countWords(page.text);

    await supabase
      .from("knowledge_web_pages")
      .update({
        status: "trained",
        content: page.text,
        word_count: words,
        error: null,
        updated_at: now,
      })
      .eq("id", next.id);

    result = {
      id: next.id,
      url: next.url,
      status: "trained",
      wordCount: words,
      error: null,
      updatedAt: now,
    };
  } catch (error) {
    const message = reason(error);

    await supabase
      .from("knowledge_web_pages")
      .update({
        status: "failed",
        error: message,
        updated_at: now,
      })
      .eq("id", next.id);

    result = {
      id: next.id,
      url: next.url,
      status: "failed",
      wordCount: 0,
      error: message,
      updatedAt: now,
    };
  }

  const crawled = Math.min(source.pages_crawled + 1, source.pages_found);
  const done = crawled >= source.pages_found;

  await supabase
    .from("knowledge_web_sources")
    .update({
      status: done ? "trained" : "crawling",
      pages_crawled: crawled,
      updated_at: now,
    })
    .eq("id", sourceId);

  // Only at the end. Revalidating after every page put a refetch of the whole
  // screen behind each one, and they were superseded by the next call anyway —
  // the row that changed is in the return value instead.
  if (done) refresh();

  return {
    ok: true,
    value: { done, crawled, found: source.pages_found, page: result },
  };
}

/**
 * One page's text, for the dialog that shows it.
 *
 * An action rather than data passed down with the table, because `content` is
 * the one large column on that table and the list draws every row of it. A
 * forty-page crawl would ship forty pages of text to the browser so that one
 * of them could be opened.
 */
export async function readWebPage(pageId: string): Promise<
  ActionResult<{
    url: string;
    content: string;
    wordCount: number;
    updatedAt: string;
  }>
> {
  const supabase = await createClient();
  const page = await getWebPage(supabase, pageId);

  if (!page) return { ok: false, error: "That page is no longer here." };

  return {
    ok: true,
    value: {
      url: page.url,
      content: page.content ?? "",
      wordCount: page.word_count,
      updatedAt: page.updated_at,
    },
  };
}

/**
 * Reads one already-crawled page again, in place.
 *
 * Synchronous, unlike the initial crawl, because it is one page and the button
 * that starts it can afford to spin while it happens. Links found this time
 * are ignored: a recrawl refreshes what is here, and quietly growing the base
 * because a page gained a link is not what the button says it does.
 */
export async function recrawlPage(pageId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const page = await getWebPage(supabase, pageId);
  if (!page) return { ok: false, error: "That page is no longer here." };

  const now = new Date().toISOString();

  try {
    const fetched = await fetchPage(page.url);

    const { error } = await supabase
      .from("knowledge_web_pages")
      .update({
        status: "trained",
        content: fetched.text,
        word_count: countWords(fetched.text),
        error: null,
        updated_at: now,
      })
      .eq("id", pageId);

    if (error) return { ok: false, error: error.message };
  } catch (error) {
    await supabase
      .from("knowledge_web_pages")
      .update({ status: "failed", error: reason(error), updated_at: now })
      .eq("id", pageId);

    return { ok: false, error: reason(error) };
  }

  refresh();
  return { ok: true, value: null };
}

/**
 * Saves a hand-edited page.
 *
 * The whole reason the text is shown in a textarea rather than a read-only
 * panel: a crawler takes the cookie banner and the footer along with the
 * prose, and the fix is a person deleting three lines. The word count is
 * recomputed here rather than trusted from the browser.
 */
export async function saveWebPageContent(
  pageId: string,
  content: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("knowledge_web_pages")
    .update({
      content,
      word_count: countWords(content),
      // Edited by hand is still trained, and an edit is the obvious way to fix
      // a page that failed on a bad character.
      status: "trained",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pageId);

  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true, value: null };
}

/**
 * Removes one page, and tells its source it is one page smaller.
 *
 * Both counters move, not just the total: leaving `pages_crawled` where it was
 * would put the bar past full, and dropping only the crawled count would make
 * a finished crawl look unfinished for ever.
 */
export async function deleteWebPage(pageId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: page, error: readError } = await supabase
    .from("knowledge_web_pages")
    .select("id, source_id, status")
    .eq("id", pageId)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!page) return { ok: true, value: null };

  const { error } = await supabase
    .from("knowledge_web_pages")
    .delete()
    .eq("id", pageId);

  if (error) return { ok: false, error: error.message };

  const { data: source } = await supabase
    .from("knowledge_web_sources")
    .select("id, pages_found, pages_crawled")
    .eq("id", page.source_id)
    .maybeSingle();

  if (source) {
    const found = Math.max(0, source.pages_found - 1);
    const crawled = Math.min(
      found,
      // A pending page was never counted as crawled, so removing it leaves the
      // crawled total alone.
      page.status === "pending" ? source.pages_crawled : source.pages_crawled - 1,
    );

    await supabase
      .from("knowledge_web_sources")
      .update({
        pages_found: found,
        pages_crawled: Math.max(0, crawled),
        status: crawled >= found ? "trained" : "crawling",
        updated_at: new Date().toISOString(),
      })
      .eq("id", page.source_id);
  }

  refresh();
  return { ok: true, value: null };
}

/** Removes a website and, by cascade, every page it produced. */
export async function deleteWebSource(sourceId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("knowledge_web_sources")
    .delete()
    .eq("id", sourceId);

  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true, value: null };
}
