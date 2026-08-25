import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, KnowledgeFaq } from "@/types/database";

/**
 * Reading the question-and-answer pairs on a base.
 *
 * No org filter on any read, for the reason given in `web-queries.ts`: RLS on
 * `knowledge_faqs` resolves the organization from the session, so a filter
 * here would be a second, weaker copy of a rule the database already applies.
 */

/**
 * Every question on one base, newest first.
 *
 * Both columns, unlike the crawler's page list -- a FAQ answer is a sentence
 * or two rather than a page of prose, and the row expands to show it in place,
 * so fetching them separately would mean a round trip to open a disclosure
 * triangle.
 */
export async function listFaqs(
  supabase: SupabaseClient<Database>,
  baseId: string,
): Promise<KnowledgeFaq[]> {
  const { data, error } = await supabase
    .from("knowledge_faqs")
    .select("*")
    .eq("base_id", baseId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load FAQs: ${error.message}`);
  }

  return data ?? [];
}

/**
 * How many questions one base holds.
 *
 * The number the limit is checked against before a write. `head: true` so
 * Postgres counts without sending rows.
 */
export async function countFaqs(
  supabase: SupabaseClient<Database>,
  baseId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("knowledge_faqs")
    .select("id", { count: "exact", head: true })
    .eq("base_id", baseId);

  if (error) {
    throw new Error(`Failed to count FAQs: ${error.message}`);
  }

  return count ?? 0;
}
