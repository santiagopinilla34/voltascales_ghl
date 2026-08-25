import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  KnowledgeWebPage,
  KnowledgeWebSource,
} from "@/types/database";

/**
 * Reading crawled websites and the pages they produced.
 *
 * Split from `crawl.ts` for the reason `queries.ts` is split from `bases.ts`:
 * the modes and the URL normaliser are needed by the Add website dialog, which
 * runs in the browser, and a module marked `server-only` cannot be imported
 * from there.
 *
 * No org filter on any read. RLS on both tables resolves the organization from
 * the session, so a filter here would be a second, weaker copy of a rule the
 * database already applies.
 */

/** Every website added to one base, newest first — the cards on the screen. */
export async function listWebSources(
  supabase: SupabaseClient<Database>,
  baseId: string,
): Promise<KnowledgeWebSource[]> {
  const { data, error } = await supabase
    .from("knowledge_web_sources")
    .select("*")
    .eq("base_id", baseId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load websites: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Every crawled page of one base, oldest first.
 *
 * The whole base rather than one source at a time: the table under the cards
 * is one table, and a page's row says which URL it is without needing to say
 * which card it came from. `content` is deliberately not selected — it is the
 * one large column here, the list never shows it, and pulling forty pages of
 * text to draw forty rows of path and status is the difference between a fast
 * screen and a slow one. The dialog fetches the text of the one page it opens.
 */
export type WebPageRow = Omit<KnowledgeWebPage, "content">;

export async function listWebPages(
  supabase: SupabaseClient<Database>,
  baseId: string,
): Promise<WebPageRow[]> {
  const { data, error } = await supabase
    .from("knowledge_web_pages")
    .select(
      "id, org_id, base_id, source_id, url, status, word_count, error, created_at, updated_at",
    )
    .eq("base_id", baseId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load crawled pages: ${error.message}`);
  }

  return data ?? [];
}

/**
 * How many crawled pages this organization holds, across every base.
 *
 * The numerator of the page limit shown in the picker, and the number the add
 * action checks before it writes anything. No base filter and no org filter:
 * the limit is per organization, and RLS is what makes "every base I can see"
 * mean "every base this organization has".
 *
 * `head: true` so Postgres counts without sending rows — this runs on every
 * discovery and the answer is one integer.
 */
export async function countWebPages(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { count, error } = await supabase
    .from("knowledge_web_pages")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to count crawled pages: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * How many crawled pages sit on one base.
 *
 * Distinct from `countWebPages` above, which has no base filter because the
 * limit it feeds is per organization. This one is the number on the All tab's
 * Web crawler card, and that card is about the base it is on.
 */
export async function countWebPagesForBase(
  supabase: SupabaseClient<Database>,
  baseId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("knowledge_web_pages")
    .select("id", { count: "exact", head: true })
    .eq("base_id", baseId);

  if (error) {
    throw new Error(`Failed to count crawled pages: ${error.message}`);
  }

  return count ?? 0;
}

/** One page, text included. What the scraped-data dialog opens. */
export async function getWebPage(
  supabase: SupabaseClient<Database>,
  pageId: string,
): Promise<KnowledgeWebPage | null> {
  const { data, error } = await supabase
    .from("knowledge_web_pages")
    .select("*")
    .eq("id", pageId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load the page: ${error.message}`);
  }

  return data;
}
