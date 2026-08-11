"use server";

import { revalidatePath } from "next/cache";

import { SETTINGS_ID } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? supabase : null;
}

/** Both pages that read this go stale when the business details change. */
function revalidateBusiness() {
  revalidatePath("/business");
  revalidatePath("/invoices");
}

export async function saveBusinessDetails(input: {
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
}): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("settings")
    .update({
      // Empty is null, matching how every other optional text column in this
      // schema stores "not set".
      business_name: input.name.trim() || null,
      business_email: input.email.trim() || null,
      business_phone: input.phone.trim() || null,
      business_address: input.address.trim() || null,
      business_website: input.website.trim() || null,
    })
    .eq("id", SETTINGS_ID);

  if (error) return { ok: false, error: error.message };

  revalidateBusiness();
  return { ok: true, value: null };
}

/**
 * Replaces the whole package list in one call.
 *
 * The editor holds the list locally and saves it as a unit, so this is a
 * delete-then-insert rather than a per-row diff. That keeps ordering honest —
 * `sort_order` is just the array index — and means a reordered, renamed and
 * newly-added set of packages is one atomic-looking save rather than a
 * sequence of writes that can half-apply.
 *
 * Rows are recreated, so package ids are not stable across saves. Nothing
 * references them: invoices snapshot their line items rather than pointing at
 * a package, precisely so repricing an offer can't rewrite history.
 */
export async function savePackages(
  input: { name: string; description: string; priceCents: number }[],
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const rows = input
    .map((item, index) => ({
      name: item.name.trim(),
      description: item.description.trim() || null,
      price_cents: item.priceCents,
      sort_order: index,
    }))
    .filter((row) => row.name);

  for (const row of rows) {
    if (!Number.isInteger(row.price_cents) || row.price_cents < 0) {
      return {
        ok: false,
        error: `"${row.name}" needs a price of zero or more.`,
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("packages")
    .delete()
    // PostgREST refuses an unfiltered delete. Every row has an id, so this
    // matches all of them while satisfying that guard.
    .not("id", "is", null);

  if (deleteError) return { ok: false, error: deleteError.message };

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("packages").insert(rows);
    if (insertError) return { ok: false, error: insertError.message };
  }

  revalidateBusiness();
  return { ok: true, value: null };
}
