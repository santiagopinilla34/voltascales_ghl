/**
 * Centralised environment access.
 *
 * Every variable in PRD section 7 is declared here so a missing value fails
 * loudly at the point of use instead of surfacing as an opaque runtime error.
 * Only the Supabase variables are read in step 1; the Twilio and Anthropic
 * accessors exist so later steps have a single place to reach for them.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local (see .env.example).`,
    );
  }
  return value;
}

/** Safe to expose to the browser. */
export const publicEnv = {
  get supabaseUrl() {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get supabaseAnonKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
};

/** Server-only. Never import this from a Client Component. */
export const serverEnv = {
  get supabaseServiceRoleKey() {
    return required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },
  get twilioAccountSid() {
    return required("TWILIO_ACCOUNT_SID", process.env.TWILIO_ACCOUNT_SID);
  },
  get twilioAuthToken() {
    return required("TWILIO_AUTH_TOKEN", process.env.TWILIO_AUTH_TOKEN);
  },
  get twilioPhoneNumber() {
    return required("TWILIO_PHONE_NUMBER", process.env.TWILIO_PHONE_NUMBER);
  },
  /**
   * Real phone that inbound calls are forwarded to. Not in PRD section 7 —
   * added in step 2 because <Dial> needs a destination.
   */
  get twilioForwardToNumber() {
    return required(
      "TWILIO_FORWARD_TO_NUMBER",
      process.env.TWILIO_FORWARD_TO_NUMBER,
    );
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
  },
};

/**
 * Shared secret for `/api/webhooks/form` (PRD 4.6). Not in PRD section 7.
 *
 * That endpoint has no signature to verify the way the Twilio ones do, and it
 * can cause an SMS to be sent to any number posted to it. Without a secret it
 * is an open SMS relay on your Twilio account, so the route refuses to serve
 * at all when this is unset — failing closed rather than quietly accepting
 * anonymous submissions.
 */
export function formWebhookSecret(): string | null {
  const value = process.env.FORM_WEBHOOK_SECRET?.trim();
  return value ? value : null;
}

/**
 * Public origin Twilio reaches this app on — the ngrok URL locally, the
 * deployment URL in production. Not in PRD section 7; added in step 2.
 *
 * Twilio signs each request over the exact URL it called, so signature
 * verification has to reconstruct that same URL. Optional: when unset the
 * webhooks fall back to the proxy's forwarded headers, which is correct under
 * both ngrok and Vercel. Set it explicitly if verification ever misbehaves.
 */
export function appBaseUrl(): string | null {
  const value = process.env.APP_BASE_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}
