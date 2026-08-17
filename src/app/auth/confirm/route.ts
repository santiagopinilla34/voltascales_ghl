import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Where emailed links land: invites, magic links, password recovery.
 *
 * The link in the email carries a one-time token and nothing else. This
 * exchanges it for a real session and writes the cookies, which is why it has
 * to be a Route Handler — a Server Component cannot set them.
 *
 * Two shapes are accepted because Supabase sends both depending on how the
 * project is configured, and getting it wrong means a client clicks the link
 * in their invite and lands on a login form with no way in:
 *
 *   - `token_hash` + `type` — the template-driven flow, the one to prefer.
 *   - `code` — the PKCE exchange, used by the hosted verify endpoint and by
 *     OAuth.
 *
 * The token is single-use and short-lived either way, so a link that has been
 * clicked once, or sat in an inbox for a day, fails here rather than silently
 * signing someone in later.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");

  // Only ever a path on this app. An open redirect here would be worth
  // something to an attacker: the victim arrives already signed in.
  const requested = searchParams.get("next") ?? "/inbox";
  const next = requested.startsWith("/") && !requested.startsWith("//")
    ? requested
    : "/inbox";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "invite" | "magiclink" | "recovery" | "email",
      token_hash: tokenHash,
    });

    if (!error) return NextResponse.redirect(`${origin}${next}`);

    console.error("[auth/confirm] verifyOtp failed", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) return NextResponse.redirect(`${origin}${next}`);

    console.error("[auth/confirm] code exchange failed", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("That link is missing its token. Ask for a new invite.")}`,
  );
}
