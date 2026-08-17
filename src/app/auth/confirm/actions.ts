"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { linkType, safeNext } from "./link-target";

export type ConfirmState = { error: string | null };

/**
 * Spends the token from an emailed link and writes the session.
 *
 * A Server Action rather than the Route Handler this replaced, and that is the
 * entire point of the change: the token is single-use, so whoever fetches the
 * URL first is the one who gets the account. Mail providers fetch every link
 * they deliver. Moving the exchange behind a form submit means the scanner
 * loads a page with a button on it and the token is still there when the
 * person arrives. See `src/lib/auth/links.ts` for the invite this was traced
 * back to.
 *
 * Two token shapes are accepted:
 *
 *   - `token_hash` + `type` — what `generateLink` mints, and what every link
 *     this app sends now carries.
 *   - `code` — the PKCE exchange, used by OAuth and by Supabase's own hosted
 *     verify endpoint. Kept so a link sent before this change, or a reset
 *     triggered from the Supabase dashboard, still lands somewhere that works.
 */
export async function confirmLink(
  _prevState: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const code = String(formData.get("code") ?? "");
  const type = linkType(String(formData.get("type") ?? "") || undefined);
  const next = safeNext(String(formData.get("next") ?? "") || undefined);

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (error) {
      console.error("[auth/confirm] verifyOtp failed", error.message);
      return { error: expired(error.message) };
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth/confirm] code exchange failed", error.message);
      return { error: expired(error.message) };
    }
  } else {
    return {
      error: "That link is missing its token. Ask for a new one.",
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

/**
 * Supabase says "Email link is invalid or has expired" for a token that was
 * spent as well as for one that timed out, and the recipient can do nothing
 * with the distinction anyway. What they need is the next step, which is why
 * the raw message is logged above and not shown.
 */
function expired(message: string): string {
  return /expired|invalid/i.test(message)
    ? "This link has already been used, or it has expired. Ask for a new one and it'll work."
    : message;
}
