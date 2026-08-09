import "server-only";

import twilio from "twilio";

import { serverEnv } from "@/lib/env";

/**
 * Twilio REST client. Created per call rather than cached at module scope so a
 * missing credential surfaces at the point of use, not at import time.
 */
export function createTwilioClient() {
  return twilio(serverEnv.twilioAccountSid, serverEnv.twilioAuthToken);
}

/** Sends an SMS from the app's dedicated number (PRD 4.1). */
export async function sendSms(to: string, body: string) {
  const client = createTwilioClient();

  return client.messages.create({
    to,
    from: serverEnv.twilioPhoneNumber,
    body,
  });
}
