import { NextResponse } from "next/server";

import {
  CONNECT_SCOPE,
  exchangeCode,
  STATE_COOKIE,
  stripePlatformConfig,
  verifyState,
} from "@/lib/payments/connect";
import { getAccountName } from "@/lib/payments/stripe";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";

/**
 * Hop two: Stripe sends the client back here with an authorization code.
 *
 * ## The check that matters
 *
 * `state` is verified before the code is touched. Without that, this route is a
 * one-click account-hijack: send a signed-in user a link to
 * `…/callback?code=<a code minted for MY Stripe account>` and their
 * organization ends up pointed at somebody else's payments. The token is
 * HMAC-signed over the organization id, compared against the cookie the first
 * hop set, and checked to match the organization the *current session* is
 * working in — so a state minted while inside one client's account cannot be
 * replayed while inside another's.
 *
 * ## Every failure lands on /payments
 *
 * Including the ones caused by the client pressing Cancel on Stripe's screen,
 * which is not an error so much as a change of mind. Rendering a bare JSON
 * error at an `/api/` URL would strand them outside the app with a back button
 * as their only way home.
 */
export async function GET(request: Request) {
  const context = await requireOrgContext();
  const url = new URL(request.url);
  const done = (params: string) =>
    clearState(NextResponse.redirect(new URL(`/payments?${params}`, request.url), { status: 303 }));

  // The client declined on Stripe's screen, or Stripe refused. Either way they
  // are simply not connected, which the gate already knows how to say.
  const denied = url.searchParams.get("error");
  if (denied) {
    return done(denied === "access_denied" ? "cancelled=1" : "error=denied");
  }

  const config = stripePlatformConfig();
  if (!config) return done("error=unconfigured");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const cookie = request.headers.get("cookie") ?? "";

  if (!code) return done("error=incomplete");

  if (!verifyState(state, readCookie(cookie, STATE_COOKIE), context.orgId)) {
    // Deliberately not explained on screen beyond "start again". The two ways
    // to get here are an expired cookie and an attack, and only one of them
    // benefits from detail.
    console.warn("[payments] rejected callback with bad state", { orgId: context.orgId });
    return done("error=state");
  }

  const exchanged = await exchangeCode(config, code);
  if (!exchanged.ok) return done("error=exchange");

  // Best-effort. A name that fails to load is a cosmetic loss, and failing the
  // whole connection over it would waste a code that cannot be reused.
  const accountName = await getAccountName(exchanged.accountId);

  const supabase = await createClient();

  // Upsert rather than insert: reconnecting an account that is already linked
  // is a thing people do — after revoking us from Stripe's side, or to switch
  // which of their accounts is shown — and it should not fail on the unique
  // index with an error about a database constraint.
  const { error } = await supabase.from("payment_connections").upsert(
    {
      org_id: context.orgId,
      provider: "stripe",
      account_id: exchanged.accountId,
      scope: exchanged.scope,
      livemode: exchanged.livemode,
      account_name: accountName,
      connected_by: context.userId,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "org_id,provider" },
  );

  if (error) {
    console.error("[payments] could not store connection", error);
    return done("error=store");
  }

  // Worth saying out loud rather than only in the row: a connection granted
  // something other than what was asked for still works, but the screen's
  // description of what it can do would be wrong.
  if (exchanged.scope !== CONNECT_SCOPE) {
    console.warn("[payments] stripe granted an unexpected scope", exchanged.scope);
  }

  return done("connected=1");
}

/**
 * The state cookie is single-use. Leaving it set would let a stale token be
 * replayed inside its ten-minute window, which is the entire thing it exists
 * to prevent.
 */
function clearState(response: NextResponse): NextResponse {
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    path: "/api/payments/stripe",
    maxAge: 0,
  });
  return response;
}

function readCookie(header: string, name: string): string {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}
