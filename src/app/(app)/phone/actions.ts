"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { A2pProfile } from "@/lib/phone/a2p";
import {
  COUNTRIES,
  NUMBER_TYPES,
  type AvailableNumber,
  type NumberSearch,
  type NumberType,
} from "@/lib/phone/numbers";
import { searchAvailableNumbers } from "@/lib/twilio/numbers";

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

/**
 * Searches Twilio for numbers to buy.
 *
 * A server action rather than a route handler because the dialog is the only
 * caller and it wants a typed result, not a fetch. Every field is re-validated
 * here: a server action is a public endpoint, and `country` in particular is
 * interpolated into the Twilio path.
 */
export async function findAvailableNumbers(
  search: NumberSearch,
): Promise<ActionResult<AvailableNumber[]>> {
  if (!(await requireUser())) {
    return { ok: false, error: "Not authenticated" };
  }

  if (!COUNTRIES.some((country) => country.code === search.country)) {
    return { ok: false, error: `${search.country} is not a supported country.` };
  }
  if (!NUMBER_TYPES.some((type) => type.value === search.type)) {
    return { ok: false, error: `${search.type} is not a valid number type.` };
  }

  const result = await searchAvailableNumbers({
    country: search.country,
    type: search.type as NumberType,
    // Anything that is not a bare area code is dropped rather than passed on:
    // Twilio 400s on a malformed one, which would surface as a useless error.
    areaCode: /^\d{3}$/.test(search.areaCode) ? search.areaCode : "",
    contains: search.contains.replace(/[^\dA-Za-z*]/g, "").slice(0, 10),
    requires: {
      voice: Boolean(search.requires.voice),
      sms: Boolean(search.requires.sms),
      mms: Boolean(search.requires.mms),
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      error: `Twilio could not be reached: ${result.error}`,
    };
  }

  return { ok: true, value: result.value };
}

/** Lets the page re-read the owned list after something changes it. */
export async function refreshNumbers(): Promise<void> {
  revalidatePath("/phone");
}

/**
 * Saves the A2P business profile as a draft.
 *
 * Nothing is sent to Twilio. This exists so the answers survive closing the
 * dialog; submitting them is a later phase, and the row records that by
 * leaving `submitted_at` null.
 *
 * Trimmed but not otherwise validated beyond the required set — Twilio's
 * embedded flow is what actually validates a registration number against its
 * authority, and duplicating those rules here would mean two validators that
 * disagree, with this one being the wrong one.
 */
export async function saveA2pProfile(
  profile: A2pProfile,
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const trimmed = Object.fromEntries(
    Object.entries(profile).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : value,
    ]),
  ) as A2pProfile;

  const { error } = await supabase.from("a2p_profile").upsert(
    {
      id: true,
      business_legal_name: trimmed.businessLegalName || null,
      business_registration_number: trimmed.businessRegistrationNumber || null,
      business_registration_authority:
        trimmed.businessRegistrationAuthority || null,
      business_type: trimmed.businessType || null,
      business_website_url: trimmed.businessWebsiteUrl || null,
      address_street: trimmed.addressStreet || null,
      address_street_secondary: trimmed.addressStreetSecondary || null,
      address_city: trimmed.addressCity || null,
      address_subdivision: trimmed.addressSubdivision || null,
      address_postal_code: trimmed.addressPostalCode || null,
      address_country_code: trimmed.addressCountryCode || null,
      contact_first_name: trimmed.contactFirstName || null,
      contact_last_name: trimmed.contactLastName || null,
      contact_email: trimmed.contactEmail || null,
      contact_phone: trimmed.contactPhone || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/phone");
  return { ok: true, value: null };
}
