import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Routes reachable without a session. Everything else redirects to /login.
 *
 * `/book` is public by design — it is the self-serve booking page, and the
 * whole point is that a lead can use it without an account. It reaches the
 * database through the service-role client on the server, never as `anon`,
 * which has no RLS policy on any table. Nothing under it renders anything
 * belonging to another visitor: the calendar shows free slots, never who holds
 * the busy ones, and `/book/cancel/[token]` shows one booking to whoever holds
 * its unguessable token.
 */
/*
 * `/auth` is public for a reason that is easy to get backwards: the whole job
 * of `/auth/confirm` is to *create* a session from an emailed token, so it is
 * necessarily reached without one. Guarding it would send every invited client
 * to the login page holding a token they can no longer spend.
 *
 * It is not a hole. `/auth/confirm` grants nothing without a valid, single-use,
 * short-lived token, and `/auth/set-password` renders a form only for a session
 * that already exists and redirects anyone else to /login.
 */
const PUBLIC_PATHS = ["/login", "/book", "/auth"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Refreshes the auth session on every request and guards the dashboard.
 *
 * Server Components cannot write cookies, so a refreshed token would otherwise
 * be discarded. This runs before rendering (from `src/proxy.ts`, Next 16's
 * replacement for the middleware convention) and writes the new cookies onto
 * the outgoing response.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Keep CDNs from caching a response that carries someone's session.
          for (const [key, headerValue] of Object.entries(headers)) {
            response.headers.set(key, headerValue);
          }
        },
      },
    },
  );

  // Must run before the response is generated so a refreshed token is written
  // back through setAll above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    // API callers want a status code, not a login page.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    // /inbox, not /dashboard: there is no /dashboard route, so an already
    // signed-in user visiting /login was being redirected into a 404.
    url.pathname = "/inbox";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
