"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { A2pProfile } from "@/lib/phone/a2p";
import {
  listDialerContacts,
  listRecentCalls,
  type DialerContact,
  type RecentCall,
} from "@/lib/phone/dialer-data";
import {
  COUNTRIES,
  NUMBER_TYPES,
  type AvailableNumber,
  type NumberSearch,
  type NumberType,
} from "@/lib/phone/numbers";
import { debit } from "@/lib/billing/credit";
import { formatCredit, RATES } from "@/lib/billing/rates";
import { getOrgContext } from "@/lib/orgs/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionSubaccount } from "@/lib/twilio/provision";
import {
  buyNumber,
  releaseNumber,
  searchAvailableNumbers,
  updateNumber,
  webhookUrls,
} from "@/lib/twilio/numbers";
import {
  catalogueClient,
  twilioScopeFor,
  type TwilioScope,
} from "@/lib/twilio/scope";

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

type Provisioned = Extract<TwilioScope, { provisioned: true }>;

/**
 * The Twilio account this caller is allowed to act on.
 *
 * Every action below used to authenticate the user and then reach for the
 * environment's credentials, which are the agency's. Signing in was therefore
 * the only thing standing between a client and the agency's phone numbers:
 * they could release them, rename them, or point their webhooks somewhere
 * else. A server action is a public endpoint, so the dialog no longer showing
 * a button is not a control.
 *
 * Refusing an unprovisioned client is the point rather than an edge case. The
 * alternative — falling back to the agency, as the send path does — is exactly
 * the behaviour being removed here.
 */
async function requireScope(): Promise<
  { ok: true; scope: Provisioned } | { ok: false; error: string }
> {
  const context = await getOrgContext();
  if (!context) return { ok: false, error: "Not authenticated" };

  const scope = await twilioScopeFor(context.orgId);

  if (!scope.provisioned) {
    return {
      ok: false,
      error:
        scope.error ??
        "There's no phone account set up for this business yet, so there is nothing to buy a number into. Your agency sets this up.",
    };
  }

  return { ok: true, scope };
}

/**
 * Searches Twilio for numbers to buy.
 *
 * A server action rather than a route handler because the dialog is the only
 * caller and it wants a typed result, not a fetch. Every field is re-validated
 * here: a server action is a public endpoint, and `country` in particular is
 * interpolated into the Twilio path.
 *
 * Deliberately *not* behind `requireScope`. Searching reads Twilio's public
 * catalogue of numbers for sale — it owns nothing, spends nothing and reveals
 * nothing about any account — so it runs on the parent credentials whoever is
 * asking. Gating it on the caller having a subaccount would mean a client with
 * no number could not open the dialog that exists to sell them one, which is
 * the wrong way round.
 */
export async function findAvailableNumbers(
  search: NumberSearch,
): Promise<ActionResult<AvailableNumber[]>> {
  const context = await getOrgContext();
  if (!context) return { ok: false, error: "Not authenticated" };

  if (!COUNTRIES.some((country) => country.code === search.country)) {
    return { ok: false, error: `${search.country} is not a supported country.` };
  }
  if (!NUMBER_TYPES.some((type) => type.value === search.type)) {
    return { ok: false, error: `${search.type} is not a valid number type.` };
  }

  const result = await searchAvailableNumbers(catalogueClient(), {
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

/**
 * The dialer's Recents and Contacts panes, fetched when a pane is opened.
 *
 * One action for both rather than two: opening the dialer usually means using
 * it, both lists are small, and one round trip beats two on a popover that is
 * expected to feel instant.
 */
export async function loadDialerPanes(): Promise<
  ActionResult<{ recents: RecentCall[]; contacts: DialerContact[] }>
> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  try {
    const [recents, contacts] = await Promise.all([
      listRecentCalls(supabase),
      listDialerContacts(supabase),
    ]);

    return { ok: true, value: { recents, contacts } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load the dialer.",
    };
  }
}

/** Lets the page re-read the owned list after something changes it. */
export async function refreshNumbers(): Promise<void> {
  revalidatePath("/phone");
}

/**
 * Buys a number. This spends money.
 *
 * Re-validates the number against a fresh Twilio search rather than trusting
 * the one posted back. A server action is a public endpoint, and this one
 * charges the account — without the check, any string reaching it becomes a
 * purchase attempt for whatever number it names.
 *
 * ## The first number is sold on credit, the rest are not
 *
 * A client is allowed to buy their first number with an empty wallet, because
 * that is the order the product asks for: buy the number, see it sitting there
 * at $0.00, top up to switch it on. The first month's rental is charged anyway,
 * which usually leaves them a couple of dollars overdrawn — visible, owed, and
 * cleared by the $10 minimum top-up.
 *
 * Every number after the first needs the rental in the balance up front. Left
 * unbounded, "you may buy at zero" is a client buying fifty numbers they never
 * pay for, on the agency's Twilio bill. One number is an onboarding step; fifty
 * is an unpaid invoice.
 *
 * ## Provisioning happens here
 *
 * A client's first purchase is also the moment their Twilio subaccount is
 * created, because that is the first moment there is anything to put in it.
 */
export async function purchaseNumber(input: {
  phoneNumber: string;
  search: NumberSearch;
}): Promise<ActionResult<{ phoneNumber: string }>> {
  const context = await getOrgContext();
  if (!context) return { ok: false, error: "Not authenticated" };

  if (!/^\+[1-9]\d{7,14}$/.test(input.phoneNumber)) {
    return { ok: false, error: "That is not a valid phone number." };
  }

  const offered = await findAvailableNumbers(input.search);
  if (!offered.ok) return offered;

  if (!offered.value.some((entry) => entry.phoneNumber === input.phoneNumber)) {
    return {
      ok: false,
      error:
        "That number is no longer available — someone else may have taken it. Search again.",
    };
  }

  const supabase = await createClient();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, kind, twilio_phone_number, credit_cents")
    .eq("id", context.orgId)
    .maybeSingle();

  if (orgError || !org) {
    return { ok: false, error: orgError?.message ?? "Could not read this account." };
  }

  const isClient = org.kind !== "agency";

  // The balance rule, and only for a client — the agency pays Twilio directly
  // and has no wallet to check.
  if (isClient && org.twilio_phone_number && org.credit_cents < RATES.numberMonthly) {
    return {
      ok: false,
      error: `A second number costs ${formatCredit(RATES.numberMonthly)} a month and your balance is ${formatCredit(org.credit_cents)}. Top up first.`,
    };
  }

  // Provisioning is idempotent, so a double-click cannot produce two
  // subaccounts. The agency skips it entirely and keeps its own account.
  let client;
  if (isClient) {
    const provisioned = await provisionSubaccount({
      orgId: org.id,
      orgName: org.name,
    });

    if (!provisioned.ok) return { ok: false, error: provisioned.error };
    client = provisioned.client;
  } else {
    const scoped = await requireScope();
    if (!scoped.ok) return scoped;
    client = scoped.scope.client;
  }

  const result = await buyNumber(client, input.phoneNumber);
  if (!result.ok) return { ok: false, error: result.error };

  // Charged after Twilio confirms, never before. A rental debited against a
  // purchase that then failed is money taken for nothing, and the client has no
  // way to see that is what happened.
  //
  // Keyed on the number's SID so a retry cannot bill the first month twice, and
  // shaped to match the monthly renewals the cron writes later.
  const period = new Date().toISOString().slice(0, 7);

  await debit(org.id, {
    cents: RATES.numberMonthly,
    kind: "rental",
    description: `Number rental — ${result.value.phoneNumber}`,
    sourceKey: `rental:${result.value.sid}:${period}`,
  });

  // The first number becomes the one this account sends from. Without this the
  // client owns a number and `sendSms` still has no `from` for them, so
  // `twilioCredentialsFor` reads the pair as unprovisioned and quietly falls
  // back to the agency's number — the exact bug this whole phase removes.
  if (!org.twilio_phone_number) {
    const { error: stampError } = await createAdminClient()
      .from("organizations")
      .update({ twilio_phone_number: result.value.phoneNumber })
      .eq("id", org.id);

    if (stampError) {
      console.error(
        "[phone] bought the number but could not set it as the account's line",
        stampError,
      );
    }
  }

  revalidatePath("/phone");
  revalidatePath("/billing");
  return { ok: true, value: { phoneNumber: result.value.phoneNumber } };
}

/** Edits a number's friendly name, and optionally re-points its webhooks. */
export async function configureNumber(input: {
  sid: string;
  friendlyName: string;
  repointWebhooks: boolean;
}): Promise<ActionResult> {
  const scoped = await requireScope();
  if (!scoped.ok) return scoped;

  if (!/^PN[0-9a-f]{32}$/i.test(input.sid)) {
    return { ok: false, error: "That is not a valid number id." };
  }

  const urls = input.repointWebhooks ? webhookUrls() : null;

  if (input.repointWebhooks && !urls) {
    return {
      ok: false,
      error:
        "APP_BASE_URL is not set, so there is nowhere to point the webhooks at.",
    };
  }

  const result = await updateNumber(scoped.scope.client, input.sid, {
    friendlyName: input.friendlyName.trim().slice(0, 64),
    ...(urls ?? {}),
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/phone");
  return { ok: true, value: null };
}

/**
 * Releases a number back to Twilio. Irreversible.
 *
 * Refuses the main line outright. Confirming twice in the UI protects against
 * a slip, not against not realising which number the app sends from — and the
 * consequence there is the whole CRM going quiet.
 *
 * Which number that is depends on who is asking, which is why it comes off the
 * scope rather than off the environment: for a client it is the number their
 * organization sends from, and the environment's would be the agency's, on an
 * account they can no longer reach anyway.
 */
export async function releaseOwnedNumber(input: {
  sid: string;
  phoneNumber: string;
}): Promise<ActionResult> {
  const scoped = await requireScope();
  if (!scoped.ok) return scoped;

  if (!/^PN[0-9a-f]{32}$/i.test(input.sid)) {
    return { ok: false, error: "That is not a valid number id." };
  }

  if (
    scoped.scope.mainNumber &&
    input.phoneNumber === scoped.scope.mainNumber
  ) {
    return {
      ok: false,
      error:
        "This is the number this account sends from. Releasing it would stop every text, the missed-call auto-reply and all booking confirmations. Point the account at another number first.",
    };
  }

  const result = await releaseNumber(scoped.scope.client, input.sid);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/phone");
  return { ok: true, value: null };
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
