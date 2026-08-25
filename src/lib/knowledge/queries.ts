import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, KnowledgeBase } from "@/types/database";

/**
 * Reading knowledge bases.
 *
 * Split from `bases.ts` for the reason `automations/queries.ts` is split from
 * `automations/config.ts`: the limit and the starter list are needed by the
 * create dialog, which runs in the browser, and a module marked `server-only`
 * cannot be imported from there. Constants and shapes on one side, anything
 * that touches Postgres on the other.
 *
 * Nothing here writes. Writes go through the server actions, which is where
 * the org scope and the limit are enforced.
 */

/**
 * Every base for the organization in scope, newest first.
 *
 * No org filter in the query, and that is not an oversight: RLS on this table
 * resolves the organization from the session, so a filter here would be a
 * second, weaker copy of a rule the database already applies. Newest first
 * because the one you just made is the one you are looking for.
 */
export async function listKnowledgeBases(
  supabase: SupabaseClient<Database>,
): Promise<KnowledgeBase[]> {
  const { data, error } = await supabase
    .from("knowledge_bases")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load knowledge bases: ${error.message}`);
  }

  return data ?? [];
}

/**
 * One base, or null when there isn't one to see.
 *
 * No org filter, for the reason above: RLS answers "is this yours" already, so
 * a base belonging to another tenant comes back as null here and the detail
 * page turns that into a 404 — the same thing a made-up id gets, which is the
 * point.
 */
export async function getKnowledgeBase(
  supabase: SupabaseClient<Database>,
  baseId: string,
): Promise<KnowledgeBase | null> {
  const { data, error } = await supabase
    .from("knowledge_bases")
    .select("*")
    .eq("id", baseId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load knowledge base: ${error.message}`);
  }

  return data;
}
