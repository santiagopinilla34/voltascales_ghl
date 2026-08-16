import "server-only";

/**
 * Configuration for browser calling.
 *
 * Separate from `serverEnv` because these three are optional in a way the
 * others are not: the app works fully without them, minus the dialer. The
 * throwing accessors in `env.ts` would take down every page that renders the
 * top bar, which is all of them.
 *
 * All three or none — a token needs the key pair to sign with and the TwiML
 * app to grant against, so a partial configuration cannot produce a working
 * dialer and should read as "not set up" rather than fail at call time.
 */
export type VoiceEnv = {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
};

export function voiceEnv(): VoiceEnv | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID?.trim();

  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    return null;
  }

  return { accountSid, apiKeySid, apiKeySecret, twimlAppSid };
}

/** Whether the dialer can place calls, for the UI to reflect before trying. */
export function voiceConfigured(): boolean {
  return voiceEnv() !== null;
}
