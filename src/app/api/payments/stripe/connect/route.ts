import { NextResponse } from "next/server";

import {
  authorizeUrl,
  createState,
  STATE_COOKIE,
  STATE_MAX_AGE_SECONDS,
  stripePlatformConfig,
} from "@/lib/payments/connect";
import { requireOrgContext } from "@/lib/orgs/context";

/**
 * Hop one: send the client to Stripe to approve.
 *
 * A route rather than a Server Action because the end of it is a redirect to a
 * third-party origin *and* a cookie set on our own. An action can do neither
 * cleanly, and the cookie is not optional — it is the only thing that ties the
 * callback back to the browser that started this.
 *
 * The organization is resolved here, on the server, and baked into the signed
 * state. Nothing in the URL says which account is being connected, so there is
 * nothing in the URL to tamper with.
 */
export async function GET(request: Request) {
  // Not `requirePlatformAdmin`: a client connecting their own Stripe is the
  // primary case, and the agency doing it while working inside their account is
  // the same code path with a different `orgId`.
  const context = await requireOrgContext();
  const config = stripePlatformConfig();

  if (!config) {
    return NextResponse.redirect(
      // Resolved against the request rather than `APP_BASE_URL`, because a
      // missing `APP_BASE_URL` is one of the ways to reach this branch.
      new URL("/payments?error=unconfigured", request.url),
      // 303 so the browser follows with a GET regardless of how it arrived.
      { status: 303 },
    );
  }

  const state = createState(context.orgId);
  const response = NextResponse.redirect(authorizeUrl(config, state, request.url), {
    status: 303,
  });

  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // Must survive the redirect back from connect.stripe.com.
    // Keyed off the origin actually in use, not `APP_BASE_URL` — a `secure`
    // cookie is silently dropped on plain-http localhost, which would fail the
    // state check on the way back and look like an attack rather than config.
    secure: new URL(request.url).protocol === "https:",
    path: "/api/payments/stripe",
    maxAge: STATE_MAX_AGE_SECONDS,
  });

  return response;
}
