"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
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
