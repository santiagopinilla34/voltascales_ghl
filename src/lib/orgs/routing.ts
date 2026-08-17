import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Working out which organization an unauthenticated request belongs to.
 *
 * This is the half of multi-tenancy that row-level security cannot do. RLS
 * answers "may this caller see this row", and a webhook has no caller — it
 * arrives with no session, goes through the service role, and bypasses every
 * policy in the database. Nothing written in phases 1 to 3 protects these
 * paths. The organization has to be established here, explicitly, or the row
 * lands in whichever account the fallback happens to name.
 *
 * ## The routing key
 *
 * Twilio puts `AccountSid` on every webhook. For a subaccount it is that
 * subaccount's own SID, which makes it better than the `To` number: it is
 * present on every event type, it survives a client buying a second number,
 * and it is the same value the request was signed with — so the lookup that
 * finds the organization also finds the token needed to verify it.
 *
 * ## Why an unrecognised SID means the agency
 *
 * Today every webhook arrives on the parent account, which is not in
 * `org_secrets` and never will be. Falling back to the agency is therefore not
 * a guess — it is the correct answer for the only account that exists, and it
 * is what keeps the live number working while subaccounts are provisioned one
 * client at a time. Once a client's subaccount is registered, their traffic
 * carries their SID and stops matching this branch.
 */

export type TwilioOrigin = {
  orgId: string;
  /** The token this request was signed with. Null means the parent's. */
  authToken: string | null;
  /** True when the SID matched a client subaccount rather than the parent. */
  isSubaccount: boolean;
};

/** The agency organization, which owns everything not claimed by a subaccount. */
export async function agencyOrgId(): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("organizations")
    .select("id")
    .eq("kind", "agency")
    .maybeSingle();

  if (error) {
    console.error("[routing] could not resolve the agency organization", error);
    return null;
  }

  return data?.id ?? null;
}

/**
 * Which organization a Twilio webhook belongs to, and what verifies it.
 *
 * Never throws and never returns null for a recognisable request: an
 * unmatched SID resolves to the agency. A failure to resolve *anything* is
 * reported as null so the caller can refuse the request rather than write a
 * row into an arbitrary account.
 */
export async function resolveTwilioOrigin(
  accountSid: string | undefined,
): Promise<TwilioOrigin | null> {
  const admin = createAdminClient();

  if (accountSid) {
    const { data, error } = await admin
      .from("org_secrets")
      .select("org_id, twilio_auth_token")
      .eq("twilio_subaccount_sid", accountSid)
      .maybeSingle();

    if (error) {
      // Deliberately not falling through to the agency here. If this lookup is
      // broken we do not know whether the request belongs to a client, and
      // filing a client's message under the agency is the exact outcome this
      // module exists to prevent.
      console.error("[routing] subaccount lookup failed", error);
      return null;
    }

    if (data) {
      return {
        orgId: data.org_id,
        authToken: data.twilio_auth_token,
        isSubaccount: true,
      };
    }
  }

  const agency = await agencyOrgId();
  if (!agency) return null;

  return { orgId: agency, authToken: null, isSubaccount: false };
}

/**
 * Which organization a contact-form submission belongs to.
 *
 * The form endpoint has no signature and no AccountSid, so the shared secret
 * is both the authentication and the routing key. A per-client secret is what
 * stops one client's website filing leads into another's account.
 *
 * Compared in the database rather than in a loop here, because a per-org
 * secret is indexed and a loop over every organization's secret would not be.
 * The global `FORM_WEBHOOK_SECRET` remains the agency's own, checked by the
 * caller, so the existing form keeps working untouched.
 */
export async function resolveOrgByFormSecret(
  secret: string,
): Promise<string | null> {
  if (!secret) return null;

  const { data, error } = await createAdminClient()
    .from("org_secrets")
    .select("org_id")
    .eq("form_webhook_secret", secret)
    .maybeSingle();

  if (error) {
    console.error("[routing] form secret lookup failed", error);
    return null;
  }

  return data?.org_id ?? null;
}

/**
 * Which organization sent an email, from the address it was sent from.
 *
 * Resend delivers every account's events to one endpoint and its payload names
 * no account of ours, so the From address is the only identifier. It is matched
 * against `settings.sending_from_email`, which is what each organization
 * configured on Email Services.
 *
 * An unmatched address is the agency's. Resend's shared sender and the
 * NOTIFY_FROM_EMAIL fallback both send as addresses no organization has
 * claimed, and dropping those events would quietly disable bounce handling for
 * every account that has not set up a domain yet.
 */
export async function resolveOrgByFromAddress(
  from: string | null | undefined,
): Promise<string | null> {
  const admin = createAdminClient();

  // "VoltaScales <alert@info.voltascales.com>" and a bare address both appear,
  // depending on how the message was sent.
  const bare = from?.match(/<([^>]+)>/)?.[1] ?? from ?? "";
  const address = bare.trim().toLowerCase();

  if (address) {
    const { data, error } = await admin
      .from("settings")
      .select("org_id, sending_from_email")
      .not("sending_from_email", "is", null);

    if (error) {
      console.error("[routing] sending-address lookup failed", error);
      return null;
    }

    // Compared here rather than in the query because the stored value carries
    // a display name too, and matching on the address inside it is not
    // something an index would help with at this size.
    const match = (data ?? []).find((row) => {
      const stored = row.sending_from_email ?? "";
      const storedBare = stored.match(/<([^>]+)>/)?.[1] ?? stored;
      return storedBare.trim().toLowerCase() === address;
    });

    if (match) return match.org_id;
  }

  return agencyOrgId();
}

/**
 * Which organization owns a booking link.
 *
 * The public booking pages have no session and no Twilio header — the slug in
 * the URL is the only thing identifying the business being booked.
 */
export async function resolveOrgBySlug(slug: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("organizations")
    .select("id, status")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[routing] slug lookup failed", error);
    return null;
  }

  // A paused account's booking page should not take new bookings — the client
  // is not being paid for, and a booking made here would text and email on the
  // agency's accounts.
  if (!data || data.status === "suspended") return null;

  return data.id;
}
