import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SubAccount, SubAccountStatus } from "@/lib/orgs/sub-accounts";

/**
 * Reading the tenant list.
 *
 * Runs as the signed-in user, so the RLS policy on `organizations` is what
 * decides the result: the agency sees every row, a client sees exactly their
 * own. That means this needs no role check of its own to be safe — a client
 * calling it gets a list of one. The pages that use it still check, because
 * "safe" and "should be reachable" are different questions.
 *
 * The shapes live in `lib/orgs/sub-accounts.ts`, which is client-safe. This
 * half never reaches the browser.
 */

/** Client organizations, newest first. The agency itself is not one. */
export async function listSubAccounts(): Promise<SubAccount[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug, invited_email, status, created_at")
    .eq("kind", "client")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[orgs] could not list sub accounts", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    invitedEmail: row.invited_email,
    status: row.status as SubAccountStatus,
    createdAt: row.created_at,
  }));
}
