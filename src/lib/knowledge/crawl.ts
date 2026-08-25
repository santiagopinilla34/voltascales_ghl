/**
 * The web crawler's rules: what the modes mean, and what a URL has to look
 * like before it is worth fetching.
 *
 * Client-safe -- no `server-only` -- because the Add website dialog runs in
 * the browser and needs the modes and the URL normaliser to tell somebody
 * their address is unusable before a round trip does. Fetching and parsing
 * live in `extract.ts`, which is server-only; nothing in this file touches the
 * network.
 */

import type { CrawlMode } from "@/types/database";

/**
 * How far to follow links from the URL somebody typed.
 *
 * Three rather than a depth number, because a depth number asks a question
 * nobody can answer about a site they have not read. "Everything under
 * /services" and "everything on this domain" are the two things people
 * actually mean, and "just this page" is what they mean when they are testing.
 *
 * Declared with the other column unions in `types/database.ts` -- it is a
 * CHECK constraint on `knowledge_web_sources.mode` before it is anything else
 * -- and re-exported here so callers reach for one module rather than two.
 */
export type { CrawlMode };

export const CRAWL_MODES: { value: CrawlMode; label: string; hint: string }[] =
  [
    {
      value: "exact",
      label: "Exact URL",
      hint: "That one page and nothing else.",
    },
    {
      value: "path",
      label: "All URLs with the path",
      hint: "Every page under the same path — /services also takes /services/roofing.",
    },
    {
      value: "domain",
      label: "All URLs in this domain",
      hint: "Every page on the same site, wherever it sits.",
    },
  ];

/**
 * The most pages one website may contribute.
 *
 * A ceiling rather than no ceiling because "all URLs in this domain" pointed
 * at a blog is unbounded, and the cost of finding that out is a knowledge base
 * full of pagination. Fifty is more than a service business's whole site and
 * few enough that a crawl finishes while somebody is still watching it.
 */
export const MAX_PAGES_PER_SOURCE = 50;

/**
 * The most crawled pages one organization may hold, across every base.
 *
 * Two costs sit behind this number and only one of them is obvious.
 *
 * The obvious one is the crawl itself: pages that need JavaScript rendering
 * spend a Firecrawl credit each, and the free tier is a thousand a month. A
 * limit above that lets a single careless "all URLs in this domain" on a blog
 * burn the month in one click.
 *
 * The one that actually matters is what happens afterwards. A knowledge base
 * is fed to an agent as context on *every reply*, so a page trained once is
 * paid for over and over in tokens for as long as it stays in the base. A
 * thousand pages of marketing copy is not a better agent than fifty pages of
 * prices and policies -- it is the same agent with a larger bill and more to
 * be wrong about.
 *
 * So it is a total, not a monthly allowance: deleting pages makes room, which
 * is the behaviour that encourages pruning. One constant, and the screen reads
 * it rather than repeating the number.
 */
export const ORG_PAGE_LIMIT = 1_000;

/** How long to wait on one page before giving up on it. */
export const FETCH_TIMEOUT_MS = 20_000;

/**
 * The URL as it will be stored, or null when it is not one.
 *
 * Adds a scheme when it is missing -- people type `voltascales.com` -- drops
 * the fragment, which is the same page, and drops a trailing slash so `/about`
 * and `/about/` cannot both be crawled into the same base.
 *
 * Only http and https. A `mailto:` or a `javascript:` in a page's markup is a
 * link but not a page, and this is the one place that has to say so, because
 * both the dialog and the link discovery below run everything through here.
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // A hostname with no dot is a machine name on a local network, not a site
  // somebody meant to type. `localhost` included -- crawling the server's own
  // loopback from a form is the shape of a request nobody makes on purpose.
  if (!url.hostname.includes(".")) return null;

  url.hash = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

/**
 * Whether `candidate` is inside `root` for the given mode.
 *
 * Same host in every case: "all URLs in this domain" means the domain that was
 * typed, not the ones it links out to. www is folded away because a site that
 * links to itself both ways would otherwise be crawled twice.
 */
export function isInScope(
  candidate: string,
  root: string,
  mode: CrawlMode,
): boolean {
  let a: URL;
  let b: URL;
  try {
    a = new URL(candidate);
    b = new URL(root);
  } catch {
    return false;
  }

  const host = (url: URL) => url.hostname.replace(/^www\./, "").toLowerCase();
  if (host(a) !== host(b)) return false;

  switch (mode) {
    case "exact":
      return a.toString() === b.toString();
    case "domain":
      return true;
    case "path": {
      const prefix = b.pathname.replace(/\/$/, "");
      // `/service` must not swallow `/services`: the boundary is a slash or
      // the end of the path, not a string prefix.
      return a.pathname === prefix || a.pathname.startsWith(`${prefix}/`);
    }
  }
}

/**
 * Extensions that are a file rather than a page.
 *
 * A PDF has text in it and one day may be worth reading; an .ico does not and
 * never will. Skipped wholesale for now — file uploads are their own source
 * type on this screen, and a crawler quietly pulling in binaries is how a base
 * ends up full of nothing.
 */
const NOT_A_PAGE =
  /\.(pdf|zip|rar|7z|gz|tar|png|jpe?g|gif|webp|avif|svg|ico|bmp|mp[34]|wav|mov|avi|webm|css|js|mjs|json|xml|rss|woff2?|ttf|eot)$/i;

/** Whether a discovered link is worth queueing at all. */
export function looksLikeAPage(url: string): boolean {
  try {
    return !NOT_A_PAGE.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Words in a block of text, counted the way a person would.
 *
 * Runs of whitespace, not a tokenizer: the number under the scraped text is
 * there to tell somebody whether a page came through whole or came through
 * empty, and for that "about nine hundred" is the whole of the answer.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** The bit of a URL worth showing in a narrow column. */
export function displayPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.origin : parsed.pathname;
  } catch {
    return url;
  }
}
