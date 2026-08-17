import "server-only";

import twilio from "twilio";

import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import type { TwilioClient } from "./scope";

/**
 * Giving a client their own Twilio subaccount.
 *
 * The last missing piece of phase 4. `src/lib/orgs/routing.ts` already routes
 * inbound webhooks by subaccount SID, `twilioCredentialsFor` in `client.ts`
 * already sends from one, and `twilioScopeFor` in `scope.ts` already reads one
 * — all three were written against a table column that nothing ever filled in.
 * This fills it in.
 *
 * ## What a subaccount is and is not
 *
 * It is a real separation of resources: its own SID and auth token, its own
 * numbers, its own usage records, and its own signature on every webhook, which
 * is what makes one client's inbound text unmistakably theirs.
 *
 * It is not a separation of money. Every charge still bills to the parent —
 * the agency — which is why the credit ledger exists and why a client's spend
 * is gated on it rather than on anything Twilio knows. Provisioning a
 * subaccount does not put the agency's balance behind a wall; the guards do.
 *
 * ## Idempotent on purpose
 *
 * Called from the purchase path, which a client can double-click. Creating two
 * subaccounts for one organization would leave the second holding the number
 * and the first holding the routing, and inbound traffic would arrive signed
 * with a SID no row claims. So an organization that already has one gets it
 * back rather than another.
 */

export type ProvisionResult =
  | { ok: true; accountSid: string; client: TwilioClient; created: boolean }
  | { ok: false; error: string };

/** Twilio's own limit on the field, and it shows in their console. */
const FRIENDLY_NAME_MAX = 64;

export async function provisionSubaccount(input: {
  orgId: string;
  orgName: string;
}): Promise<ProvisionResult> {
  const admin = createAdminClient();

  const existing = await admin
    .from("org_secrets")
    .select("twilio_subaccount_sid, twilio_auth_token")
    .eq("org_id", input.orgId)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, error: existing.error.message };
  }

  const sid = existing.data?.twilio_subaccount_sid?.trim();
  const token = existing.data?.twilio_auth_token?.trim();

  if (sid && token) {
    return {
      ok: true,
      accountSid: sid,
      client: twilio(sid, token),
      created: false,
    };
  }

  // Named so the agency can tell them apart in Twilio's console, where the
  // only other identifier is a 34-character SID. The organization id is on the
  // end because two clients really can be called the same thing.
  const friendlyName = `${input.orgName} (${input.orgId.slice(0, 8)})`.slice(
    0,
    FRIENDLY_NAME_MAX,
  );

  let created;
  try {
    const parent = twilio(
      serverEnv.twilioAccountSid,
      serverEnv.twilioAuthToken,
    );
    created = await parent.api.v2010.accounts.create({ friendlyName });
  } catch (error) {
    console.error("[twilio/provision] subaccount creation failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Twilio refused to create the account.",
    };
  }

  // The auth token is returned once, on creation, and cannot be read back
  // afterwards — only reset, which would invalidate the webhook signatures of
  // any number already attached. If this write fails the subaccount exists and
  // is unreachable, so it is reported rather than swallowed, and the caller
  // stops before buying a number into an account it cannot authenticate.
  const stored = await admin.from("org_secrets").upsert(
    {
      org_id: input.orgId,
      twilio_subaccount_sid: created.sid,
      twilio_auth_token: created.authToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" },
  );

  if (stored.error) {
    console.error(
      "[twilio/provision] created subaccount but could not store its token",
      created.sid,
      stored.error,
    );
    return {
      ok: false,
      error: `Twilio created the account ${created.sid} but its credentials could not be saved, so nothing was bought. Give this SID to your developer — it needs attaching by hand or closing.`,
    };
  }

  return {
    ok: true,
    accountSid: created.sid,
    client: twilio(created.sid, created.authToken),
    created: true,
  };
}
