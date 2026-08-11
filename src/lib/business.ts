import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Package, Settings } from "@/types/database";

/** The business's own details, as the invoice footer needs them. */
export type BusinessDetails = {
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
};

/**
 * Reads the business block off the settings singleton.
 *
 * Nulls collapse to empty strings here rather than at every call site: an
 * unfilled field and a blank one mean the same thing to an invoice, and the
 * renderer only ever asks "is there text".
 */
export function businessDetailsOf(settings: Settings | null): BusinessDetails {
  return {
    name: settings?.business_name ?? "",
    email: settings?.business_email ?? "",
    phone: settings?.business_phone ?? "",
    address: settings?.business_address ?? "",
    website: settings?.business_website ?? "",
  };
}

/** The offers list, in the order it is sold. */
export async function listPackages(
  supabase: SupabaseClient<Database>,
): Promise<Package[]> {
  const { data, error } = await supabase
    .from("packages")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load packages: ${error.message}`);
  }

  return data ?? [];
}
