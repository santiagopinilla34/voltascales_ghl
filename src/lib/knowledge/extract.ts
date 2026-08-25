import "server-only";

import {
  FETCH_TIMEOUT_MS,
  countWords,
  looksLikeAPage,
  normalizeUrl,
} from "@/lib/knowledge/crawl";
import { serverEnv } from "@/lib/env";

/**
 * Reading a page: fetching it, pulling the words out, and finding the links.
 *
 * ## Why there are two ways of doing it
 *
 * Half the sites this will be pointed at are server-rendered and a plain
 * `fetch` returns everything on them. The other half are React apps that
 * return a seven-kilobyte shell and build the page in the browser, and a plain
 * `fetch` of one of those yields a `<title>` and nothing else -- which is not
 * an error, so nothing would report it. The knowledge base would simply be
 * empty and the client would conclude the crawler does not work.
 *
 * So: fetch directly, and if what comes back is thin, ask a renderer for the
 * same URL and keep whichever gave more words.
 *
 * Keeping the longer one rather than trusting the renderer outright is the
 * part worth explaining. The first version of this asked "did the direct fetch
 * return almost nothing", and voltascales.com walked straight through it: its
 * shell carries a two-hundred-word block of SEO boilerplate listing the pages
 * of the site, which is not nothing, is not the page, and passes any threshold
 * low enough to be safe. Trusting the renderer instead would be worse in the
 * other direction -- it can be rate-limited, and it sometimes reads less of a
 * server-rendered page than the page itself contains. Comparing the two costs
 * one extra request on thin pages only, and cannot lose text either way.
 *
 * ## The renderer
 *
 * A renderer is a service that loads the page in a real browser, runs its
 * JavaScript and hands back the text. There are two, tried in that order:
 *
 * - **Firecrawl**, when `FIRECRAWL_API_KEY` is set. Paid, with a free tier,
 *   and the one to rely on.
 * - **r.jina.ai**, otherwise. Free, public, no key, no SLA. It is the reason
 *   the crawler worked before there was a key, and it stays as the fallback so
 *   an expired key or an exhausted month degrades the crawl rather than
 *   breaking it.
 *
 * Both live behind one function on purpose: swapping either, or moving to a
 * headless browser, is a change to `render()` and to nothing else in the app.
 *
 * It is worth being plain about what this means: for a site that needs
 * rendering, the URL the client typed is sent to a third party. That is fine
 * for a public marketing site, which is what this feature is for, and it would
 * not be fine for anything behind a login -- which the crawler cannot reach
 * anyway.
 */

/** Where to send a URL when there is no Firecrawl key. */
const READER_ENDPOINT =
  process.env.KNOWLEDGE_READER_ENDPOINT ?? "https://r.jina.ai/";

/** Firecrawl's single-page read. */
const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";

/**
 * Below this many words, read the page a second time through the renderer and
 * keep the better answer.
 *
 * Set generously rather than tightly. Above four hundred words the direct
 * fetch has certainly got the real page and a second request would be waste;
 * below it, the page is either genuinely short -- where rendering costs a
 * request and changes nothing -- or it is a shell, where rendering is the only
 * way to see anything at all. The asymmetry is the whole argument: guessing
 * "shell" about a real page is free, and guessing "real page" about a shell
 * stores boilerplate as though it were the site.
 */
const SHELL_WORD_THRESHOLD = 400;

/** What the app agrees to be seen as. Honest, and with a way to be blocked. */
const USER_AGENT =
  "Mozilla/5.0 (compatible; VoltaScalesBot/1.0; +https://voltascales.com)";

export type FetchedPage = {
  /** The words, one block per line. */
  text: string;
  /** Every link on the page, absolute and de-duplicated. */
  links: string[];
  title: string | null;
  /** True when the renderer was needed, which is worth knowing when debugging. */
  rendered: boolean;
};

/**
 * One page, read.
 *
 * Throws rather than returning an error shape: every caller stores the message
 * on the row and moves to the next URL, and a thrown `Error` carries the
 * message from `fetch` itself -- DNS, TLS, timeout -- without this file having
 * to enumerate them.
 */
export async function fetchPage(url: string): Promise<FetchedPage> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // The crawler's whole job is to see what is there now. A cached copy of a
    // page from an earlier crawl is the one thing a recrawl must not return.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`The site answered ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("html")) {
    throw new Error(`That address is ${contentType.split(";")[0]}, not a page.`);
  }

  const html = await response.text();
  // `response.url` rather than `url`: after a redirect the links are relative
  // to where it landed, not to where it was pointed.
  const links = extractLinks(html, response.url);
  const title = extractTitle(html);
  const text = htmlToText(html);

  const directWords = countWords(text);
  if (directWords >= SHELL_WORD_THRESHOLD) {
    return { text, links, title, rendered: false };
  }

  const rendered = await render(url);
  // The renderer is best-effort. If it is down, rate-limiting, or simply read
  // less than the page's own HTML did, the direct text stands.
  if (!rendered || countWords(rendered.text) <= directWords) {
    return { text, links, title, rendered: false };
  }

  return {
    text: rendered.text,
    // Links found in the shell are still real -- a nav rendered on the server
    // is common even in an app that renders everything else -- so keep both.
    links: unique([...links, ...rendered.links]),
    title: title ?? rendered.title,
    rendered: true,
  };
}

type Rendered = { text: string; links: string[]; title: string | null };

/**
 * The same URL, through a renderer that runs its JavaScript.
 *
 * Returns null rather than throwing on any failure: this is the fallback, and
 * a fallback that can fail the request it was meant to rescue is worse than no
 * fallback. That is also why an unsuccessful Firecrawl call drops through to
 * the free reader instead of giving up -- a month's credits running out on a
 * Friday should cost quality, not the feature.
 */
async function render(url: string): Promise<Rendered | null> {
  if (serverEnv.firecrawlApiKey) {
    const rendered = await renderWithFirecrawl(url, serverEnv.firecrawlApiKey);
    if (rendered) return rendered;
  }

  return renderWithReader(url);
}

/** Firecrawl: a key, a POST, and markdown back. */
async function renderWithFirecrawl(
  url: string,
  apiKey: string,
): Promise<Rendered | null> {
  try {
    const response = await fetch(FIRECRAWL_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url,
        // Markdown for the words, links for the crawl's next pages.
        formats: ["markdown", "links"],
        // `onlyMainContent` defaults to true and strips the nav, the header and
        // the footer. Off, because those carry the phone number, the opening
        // hours and the service list -- which on a small business site is
        // frequently the most answerable content on the page, and is exactly
        // what an agent gets asked about.
        onlyMainContent: false,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 2),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const body: unknown = await response.json();
    const data =
      typeof body === "object" && body !== null && "data" in body
        ? (body as { data?: Record<string, unknown> }).data
        : undefined;

    const markdown = typeof data?.markdown === "string" ? data.markdown : "";
    if (!markdown.trim()) return null;

    const links = Array.isArray(data?.links)
      ? data.links.filter((link): link is string => typeof link === "string")
      : [];

    const metadata =
      typeof data?.metadata === "object" && data.metadata !== null
        ? (data.metadata as { title?: unknown })
        : undefined;

    return {
      text: markdownToText(markdown),
      links: unique(
        links
          .map((link) => toAbsolute(link, url))
          .filter((link): link is string => link !== null),
      ),
      title: typeof metadata?.title === "string" ? metadata.title : null,
    };
  } catch {
    return null;
  }
}

/** The keyless fallback. Free, public, and not to be relied on. */
async function renderWithReader(url: string): Promise<Rendered | null> {
  try {
    const response = await fetch(`${READER_ENDPOINT}${url}`, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 2),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const body = await response.text();
    return parseReaderMarkdown(body, url);
  } catch {
    return null;
  }
}

/**
 * The renderer's markdown, turned back into the lines a person would read.
 *
 * Markdown is a convenient thing for it to return and a useless thing to store:
 * an agent quoting `[Book a call](https://…)` at a customer is the failure this
 * avoids. Links keep their text and lose their target -- except that the
 * targets are collected on the way past, because they are also the site's
 * navigation and therefore the crawl's next pages.
 */
function parseReaderMarkdown(
  body: string,
  base: string,
): { text: string; links: string[]; title: string | null } {
  // The service prefixes the content with `Title:`, `URL Source:` and a
  // `Markdown Content:` marker. Everything before the marker is about the
  // fetch rather than from the page.
  const marker = body.indexOf("Markdown Content:");
  const head = marker === -1 ? "" : body.slice(0, marker);
  const content = marker === -1 ? body : body.slice(marker + 17);

  const title = /^Title:\s*(.+)$/m.exec(head)?.[1]?.trim() ?? null;

  const links: string[] = [];
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]+)/g)) {
    const absolute = toAbsolute(match[1], base);
    if (absolute) links.push(absolute);
  }

  return { text: markdownToText(content), links: unique(links), title };
}

/**
 * Markdown, reduced to the lines a person would read.
 *
 * Shared by both renderers, since both answer in markdown. Markdown is a
 * convenient thing for them to return and a useless thing to store: an agent
 * quoting `[Book a call](https://…)` at a customer is the failure this avoids.
 */
function markdownToText(markdown: string): string {
  return tidy(
    markdown
      // Images carry no words worth keeping, and their alt text is usually the
      // file name.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/^\s*[-*_]{3,}\s*$/gm, "")
      .replace(/[*_`]{1,3}/g, "")
      .replace(/^\s*>\s?/gm, ""),
  );
}

/** The `<title>`, which is the only part of a shell worth having. */
function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return title || null;
}

/**
 * Every `href` on the page, absolute, de-duplicated, and plausibly a page.
 *
 * A regex rather than a parser. The alternative is a DOM implementation in the
 * dependency list to answer one question about one attribute, and the failure
 * mode of getting this slightly wrong is a link that is not followed -- not a
 * corrupted page.
 */
function extractLinks(html: string, base: string): string[] {
  const found: string[] = [];

  for (const match of html.matchAll(/<a\b[^>]*?href\s*=\s*("[^"]*"|'[^']*'|[^\s">]+)/gi)) {
    const raw = match[1].replace(/^["']|["']$/g, "");
    const absolute = toAbsolute(raw, base);
    if (absolute) found.push(absolute);
  }

  return unique(found);
}

/** A href resolved against the page it was found on, or null if unusable. */
function toAbsolute(href: string, base: string): string | null {
  // Entities first, because an attribute is escaped HTML before it is a URL.
  // A link with two query parameters is written `?a=1&amp;b=2` in the markup,
  // and left undecoded that is not the same address: the second parameter
  // comes out named `amp;b`, so the URL never matches the same page linked
  // somewhere else without the escape, and no amount of tidying the query
  // afterwards can recognise it.
  const trimmed = decodeEntities(href).trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  let resolved: string;
  try {
    resolved = new URL(trimmed, base).toString();
  } catch {
    return null;
  }

  const normalized = normalizeUrl(resolved);
  if (!normalized) return null;

  return looksLikeAPage(normalized) ? normalized : null;
}

/**
 * HTML, reduced to the words in it.
 *
 * The order matters and is the whole of the trick: kill the elements whose
 * contents are not prose first, turn the tags that end a block into newlines
 * second, and only then remove what is left. Doing it the other way round runs
 * a heading into the paragraph under it, which is how "Pricing" and "From $500"
 * become one sentence that says neither.
 */
export function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1>/gi, "")
    // A self-closed or unterminated one of the same, which real markup has.
    .replace(/<(script|style|noscript|template|svg|iframe)\b[^>]*\/?>/gi, "");

  const withBreaks = withoutNoise
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(p|div|section|article|header|footer|main|aside|nav|h[1-6]|li|ul|ol|tr|table|blockquote|figcaption|form|label|option)\s*>/gi,
      "\n",
    )
    .replace(/<(hr|tr|li|h[1-6]|p|div)\b[^>]*\/?>/gi, "\n");

  return tidy(decodeEntities(withBreaks.replace(/<[^>]+>/g, " ")));
}

/**
 * Whitespace, made presentable.
 *
 * Spaces inside a line collapse to one; a line that is only whitespace goes;
 * a run of blank lines becomes one. What comes out is one block of text per
 * line, which is the shape the dialog shows and the shape a person can edit.
 */
function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The handful of entities that appear in prose.
 *
 * Not a full table: numeric references cover most of what is left, and an
 * unrecognised `&thinsp;` surviving as text in one line is a smaller problem
 * than a dependency for it.
 */
function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
    hellip: "…",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
    times: "×",
    trade: "™",
    copy: "©",
    reg: "®",
    deg: "°",
    eacute: "é",
    egrave: "è",
  };

  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      safeCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      safeCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&([a-z]+);/gi, (whole, name: string) => named[name.toLowerCase()] ?? whole);
}

/** A code point, or the reference back untouched when it is not one. */
function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** Order-preserving de-duplication. */
function unique(values: string[]): string[] {
  return [...new Set(values)];
}

// ---------------------------------------------------------------------------
// Sitemaps
// ---------------------------------------------------------------------------

/**
 * Every URL a site says it has.
 *
 * A sitemap is the site telling you its own contents, which beats guessing
 * from links in every way that matters: it lists pages nothing links to, it
 * skips the ones behind a form, and reading it is one request instead of one
 * per page. So it is tried first, and following links is the fallback.
 *
 * Returns null when there is no usable sitemap — which the caller shows as
 * "discover by crawling" rather than as an error, because plenty of small
 * business sites simply do not have one.
 */
export async function fetchSitemapUrls(root: string): Promise<string[] | null> {
  let origin: string;
  try {
    origin = new URL(root).origin;
  } catch {
    return null;
  }

  const candidates = [
    // What the site itself nominates, which is the only authoritative answer.
    ...(await sitemapsFromRobots(origin)),
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
  ];

  const seen = new Set<string>();
  const found: string[] = [];

  for (const candidate of unique(candidates)) {
    // One level of nesting. A sitemap index pointing at sitemap indexes is
    // legal and, in the wild, is either a mistake or a trap.
    const urls = await readSitemap(candidate, seen, 1);
    found.push(...urls);
    if (found.length >= SITEMAP_URL_CAP) break;
  }

  const usable = unique(found)
    .map((url) => normalizeUrl(url))
    .filter((url): url is string => url !== null && looksLikeAPage(url));

  return usable.length > 0 ? usable.slice(0, SITEMAP_URL_CAP) : null;
}

/**
 * How many URLs to take off a sitemap at most.
 *
 * Well above what anyone will train and well below what a news site publishes.
 * The point of the cap is that the picker stays a list you can read rather
 * than a wall you scroll past; what actually gets crawled is whatever is
 * ticked in it, bounded separately.
 */
const SITEMAP_URL_CAP = 2_000;

/** The `Sitemap:` lines in robots.txt, if there is one. */
async function sitemapsFromRobots(origin: string): Promise<string[]> {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) return [];

    const body = await response.text();
    return [...body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  } catch {
    return [];
  }
}

/**
 * One sitemap, or one sitemap index followed one level down.
 *
 * The content check is load-bearing rather than defensive. A single-page app
 * answers 200 with its HTML shell for *every* path, so `/sitemap_index.xml`
 * on a site that has no such file looks exactly like one that does — right up
 * until you try to read `<loc>` out of a React bundle. Requiring the body to
 * actually contain a `<urlset` or `<sitemapindex` is what tells them apart.
 */
async function readSitemap(
  url: string,
  seen: Set<string>,
  depth: number,
): Promise<string[]> {
  if (seen.has(url) || seen.size > 50) return [];
  seen.add(url);

  let body: string;
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) return [];
    body = await response.text();
  } catch {
    return [];
  }

  if (!/<(urlset|sitemapindex)\b/i.test(body)) return [];

  const locations = [...body.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map(
    (match) => decodeEntities(match[1]).trim(),
  );

  const isIndex = /<sitemapindex\b/i.test(body);
  if (!isIndex) return locations;

  if (depth <= 0) return [];

  const collected: string[] = [];
  for (const child of locations) {
    collected.push(...(await readSitemap(child, seen, depth - 1)));
    if (collected.length >= SITEMAP_URL_CAP) break;
  }

  return collected;
}
