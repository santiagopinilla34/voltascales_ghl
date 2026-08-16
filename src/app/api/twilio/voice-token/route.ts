import { NextResponse } from "next/server";
import twilio from "twilio";

import { createClient } from "@/lib/supabase/server";
import { voiceEnv } from "@/lib/twilio/voice";

/**
 * Mints an access token for the browser dialer.
 *
 * The token is what lets a browser register with Twilio and place a call, so
 * it is a credential in its own right — anyone holding one can make calls that
 * this account pays for. Two things follow:
 *
 *   It is issued only to a signed-in session. The dialer is inside the
 *   authenticated shell, so an unauthenticated request here is never
 *   legitimate.
 *
 *   It is short-lived. An hour is Twilio's maximum and far longer than needed;
 *   the SDK asks for a fresh one when it expires, so a leaked token stops
 *   being useful quickly.
 *
 * Never cached. A cached token would be handed to whoever asked next, and
 * would expire mid-call for everyone at once.
 */
export const dynamic = "force-dynamic";

/** Twenty minutes. Long enough for a call, short enough to matter if leaked. */
const TTL_SECONDS = 20 * 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const env = voiceEnv();
  if (!env) {
    return NextResponse.json(
      {
        error:
          "Browser calling is not configured. TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET and TWILIO_TWIML_APP_SID all need to be set.",
      },
      { status: 503 },
    );
  }

  const { AccessToken } = twilio.jwt;
  const { VoiceGrant } = AccessToken;

  const token = new AccessToken(
    env.accountSid,
    env.apiKeySid,
    env.apiKeySecret,
    {
      // Twilio requires an identity on the token; it is the name the browser
      // registers under. One operator, one identity.
      identity: "operator",
      ttl: TTL_SECONDS,
    },
  );

  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: env.twimlAppSid,
      // No incoming allowance. Inbound calls go to the existing voice webhook,
      // which forwards to a real phone — letting the browser also register for
      // incoming would make the two race for the same call.
      incomingAllow: false,
    }),
  );

  return NextResponse.json(
    { token: token.toJwt(), identity: "operator", expiresIn: TTL_SECONDS },
    { headers: { "cache-control": "no-store" } },
  );
}
