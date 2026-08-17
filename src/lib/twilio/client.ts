import "server-only";

import twilio from "twilio";

import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Twilio REST client. Created per call rather than cached at module scope so a
 * missing credential surfaces at the point of use, not at import time.
 */
export function createTwilioClient() {
  return twilio(serverEnv.twilioAccountSid, serverEnv.twilioAuthToken);
}

/**
 * Sends an SMS on behalf of one organization (PRD 4.1).
 *
 * `orgId` decides both halves of the send: whose number it comes from, and
 * whose Twilio account pays for it. A client's text must go out from their own
 * number — a customer replying to a message would otherwise reply to the
 * agency's number and land in the agency's inbox — and it must be billed to
 * their subaccount, or the usage that decides what they are charged is
 * indistinguishable from everyone else's.
 *
 * Falls back to the agency's own number and credentials when the organization
 * has no subaccount provisioned yet, which is every organization today. That
 * keeps the live number working while clients are migrated one at a time, and
 * it is the correct answer for the agency itself in any case.
 *
 * Omitting `orgId` uses the agency. Left optional rather than required because
 * a handful of callers genuinely are the agency talking on its own behalf, and
 * a required parameter they would fill with the same lookup adds nothing.
 */
export async function sendSms(to: string, body: string, orgId?: string) {
  const credentials = orgId ? await twilioCredentialsFor(orgId) : null;

  const client = credentials
    ? twilio(credentials.accountSid, credentials.authToken)
    : createTwilioClient();

  return client.messages.create({
    to,
    from: credentials?.from ?? serverEnv.twilioPhoneNumber,
    body,
  });
}

/**
 * A client's own Twilio identity, or null to use the agency's.
 *
 * Both halves have to be present to be usable — a subaccount SID without its
 * auth token cannot authenticate, and a number without a subaccount would send
 * from the client's number on the agency's account, which Twilio rejects
 * anyway. Anything partial reads as "not provisioned" rather than as a
 * half-working state.
 */
async function twilioCredentialsFor(
  orgId: string,
): Promise<{ accountSid: string; authToken: string; from: string } | null> {
  const admin = createAdminClient();

  const [secrets, org] = await Promise.all([
    admin
      .from("org_secrets")
      .select("twilio_subaccount_sid, twilio_auth_token")
      .eq("org_id", orgId)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("twilio_phone_number")
      .eq("id", orgId)
      .maybeSingle(),
  ]);

  if (secrets.error || org.error) {
    console.error(
      "[twilio] could not read the organization's credentials, falling back to the agency",
      secrets.error ?? org.error,
    );
    return null;
  }

  const accountSid = secrets.data?.twilio_subaccount_sid?.trim();
  const authToken = secrets.data?.twilio_auth_token?.trim();
  const from = org.data?.twilio_phone_number?.trim();

  if (!accountSid || !authToken || !from) return null;

  return { accountSid, authToken, from };
}
