import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { EMPTY_A2P_PROFILE, type A2pProfile } from "@/lib/phone/a2p";
import type { Database } from "@/types/database";

/**
 * Reads the A2P draft back out.
 *
 * Nulls collapse to empty strings so the form has no partial state to reason
 * about: every field is a string, always, and "not answered" and "answered
 * with nothing" are the same thing to a text input.
 */
export async function getA2pProfile(
  supabase: SupabaseClient<Database>,
): Promise<{
  profile: A2pProfile;
  /**
   * Whether a draft has actually been saved.
   *
   * Read from the row's existence rather than inferred from how many fields
   * are filled. Counting fields gets this wrong immediately: the empty profile
   * ships with a default country code, so a never-touched form already looks
   * partly complete and the page claims "your answers are saved" to someone
   * who has never opened it.
   */
  exists: boolean;
  submittedAt: string | null;
}> {
  const { data, error } = await supabase
    .from("a2p_profile")
    .select("*")
    .maybeSingle();

  // A missing row is the normal state before anything is filled in, not a
  // failure. Anything else is worth surfacing in the log but not worth taking
  // the page down for.
  if (error) {
    console.error("[phone/profile] failed to read A2P draft", error);
    return { profile: EMPTY_A2P_PROFILE, exists: false, submittedAt: null };
  }
  if (!data) {
    return { profile: EMPTY_A2P_PROFILE, exists: false, submittedAt: null };
  }

  return {
    profile: {
      businessLegalName: data.business_legal_name ?? "",
      businessRegistrationNumber: data.business_registration_number ?? "",
      businessRegistrationAuthority: data.business_registration_authority ?? "",
      businessType: data.business_type ?? "",
      businessWebsiteUrl: data.business_website_url ?? "",
      addressStreet: data.address_street ?? "",
      addressStreetSecondary: data.address_street_secondary ?? "",
      addressCity: data.address_city ?? "",
      addressSubdivision: data.address_subdivision ?? "",
      addressPostalCode: data.address_postal_code ?? "",
      addressCountryCode: data.address_country_code ?? "US",
      contactFirstName: data.contact_first_name ?? "",
      contactLastName: data.contact_last_name ?? "",
      contactEmail: data.contact_email ?? "",
      contactPhone: data.contact_phone ?? "",
    },
    exists: true,
    submittedAt: data.submitted_at,
  };
}
