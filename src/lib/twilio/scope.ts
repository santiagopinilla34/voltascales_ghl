import "server-only";

import twilio from "twilio";

import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Whose Twilio account a request is allowed to touch.
 *
 * Every function in `lib/twilio/numbers.ts` used to build its own client from
 * the environment, which meant one account for the whole app: the agency's.
 * Fine while the agency was the only tenant, wrong the moment a client signed
 * in. They opened Phone System and saw the agency's numbers listed as theirs —
 * and, worse than cosmetic, the buttons next to those numbers worked. Only the
 * main line was guarded against release, so a client could hand back any other
 * number the agency rented, or re-point its webhooks at nothing.
 *
 * So the client is resolved from the organization now, not from the process.
 * Three outcomes, and the third is the common one today:
 *
 *   - the agency itself       → the environment credentials, as before
 *   - a provisioned client    → their own subaccount
 *   - an unprovisioned client → nothing to talk to, and nothing to show
 *
 * The third is not an error. It is what a client account looks like before
 * anyone has bought them a number, and the page renders an empty state for it
 * rather than borrowing someone else's account to have something to draw.
 *
 * Mirrors `twilioCredentialsFor` in `client.ts`, which makes the same
 * judgement for the send path — with the deliberate difference that sending
 * falls back to the agency and this does not. A text going out from the
 * agency's number is a degraded send; a client editing the agency's numbers is
 * a tenancy leak.
 */

export type TwilioClient = ReturnType<typeof twilio>;

export type TwilioScope =
  | {
      provisioned: true;
      kind: "agency" | "subaccount";
      client: TwilioClient;
      /**
       * The number this organization actually sends from, which is what makes
       * the "Main line" badge mean anything. Read from the environment for the
       * agency and from the organization for a client — the same split the
       * send path makes, so the badge cannot disagree with reality.
       */
      mainNumber: string | null;
    }
  /**
   * `error` separates "this client has no Twilio account yet" (null) from "the
   * lookup failed" (a message). Telling someone to buy a number because a
   * database read timed out is how they end up with two.
   */
  | { provisioned: false; error: string | null };

/**
 * The parent account, for reading Twilio's catalogue of numbers for sale.
 *
 * Not a scope and not a back door. Searching what is available to buy owns
 * nothing, spends nothing and says nothing about any account — the catalogue is
 * the same list for everyone. Gating it on the caller having a subaccount would
 * lock a client with no number out of the dialog whose whole job is to sell
 * them one.
 *
 * Buying, listing, editing and releasing all go through `twilioScopeFor`, and
 * this must not be reached for by any of them.
 */
export function catalogueClient(): TwilioClient {
  return twilio(serverEnv.twilioAccountSid, serverEnv.twilioAuthToken);
}

export async function twilioScopeFor(orgId: string): Promise<TwilioScope> {
  const admin = createAdminClient();

  const [org, secrets] = await Promise.all([
    admin
      .from("organizations")
      .select("kind, twilio_phone_number")
      .eq("id", orgId)
      .maybeSingle(),
    admin
      .from("org_secrets")
      .select("twilio_subaccount_sid, twilio_auth_token")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  if (org.error || secrets.error) {
    const message = (org.error ?? secrets.error)!.message;
    console.error("[twilio/scope] could not read the organization", message);
    return { provisioned: false, error: message };
  }

  if (org.data?.kind === "agency") {
    return {
      provisioned: true,
      kind: "agency",
      client: twilio(serverEnv.twilioAccountSid, serverEnv.twilioAuthToken),
      mainNumber: process.env.TWILIO_PHONE_NUMBER?.trim() || null,
    };
  }

  const accountSid = secrets.data?.twilio_subaccount_sid?.trim();
  const authToken = secrets.data?.twilio_auth_token?.trim();

  // Both halves or neither. A SID without its token cannot authenticate, and
  // treating a half-filled row as provisioned turns a setup mistake into a
  // Twilio 401 on every page load.
  if (!accountSid || !authToken) return { provisioned: false, error: null };

  return {
    provisioned: true,
    kind: "subaccount",
    client: twilio(accountSid, authToken),
    mainNumber: org.data?.twilio_phone_number?.trim() || null,
  };
}
