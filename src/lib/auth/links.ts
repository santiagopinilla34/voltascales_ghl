import "server-only";

import { appBaseUrl } from "@/lib/env";
import { sendEmail } from "@/lib/notify/email";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Invite and password-reset links, generated here and mailed through Resend.
 *
 * Supabase will happily send both emails itself, and that is what this replaced.
 * Two things were wrong with it.
 *
 * The first is the reason a client's invite arrived dead. Supabase's own
 * template links at its hosted `/auth/v1/verify`, which spends the one-time
 * token on the GET. Anything that fetches the URL spends it — and mail
 * providers fetch every link in every message, looking for phishing, seconds
 * after delivery. The invite sent on 2026-08-17 at 19:13:46 was confirmed at
 * 19:14:04, eighteen seconds later, by something that was not a person: the
 * organization was still `invited`, so no password form was ever submitted.
 * The client clicked two hours later and got `otp_expired`.
 *
 * So the link handed out here points at our own `/auth/confirm`, which shows a
 * button and does not verify anything until it is pressed. A scanner follows
 * links; it does not press buttons.
 *
 * The second is smaller but would have arrived soon: Supabase's built-in
 * mailer is rate limited to a handful of messages an hour and is documented as
 * not for production. Onboarding four clients in one sitting would have
 * silently dropped the fourth invite. Resend is already wired up for every
 * other message this app sends, and is where the agency's verified sending
 * domain lives.
 *
 * `generateLink` never sends anything itself. It mints the token and, for an
 * invite, creates the auth user — which is why the failure path below hands
 * the caller a user id to undo.
 */

export type AuthLinkKind = "invite" | "recovery";

export type AuthLinkResult =
  | { ok: true; userId: string }
  /**
   * `userId` is set when the account was created and the email then failed to
   * go out. The caller owns that rollback, the same way it owns the
   * organization's — see `createSubAccount`.
   */
  | { ok: false; error: string; userId: string | null };

/** Where the emailed link lands. Verified on submit, not on load. */
function confirmUrl(kind: AuthLinkKind, tokenHash: string): string {
  const base = appBaseUrl() ?? "http://localhost:3000";
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: kind,
    next: "/auth/set-password",
  });

  return `${base}/auth/confirm?${params}`;
}

/**
 * The agency's organization, for the From address.
 *
 * `sendEmail` needs telling whose mail this is, and the answer is always the
 * agency: a client's invite cannot come from the client's own domain, because
 * at the point it is sent they have no account and the domain is not set up.
 *
 * Passing nothing is not the same as passing this. `resolveSendingFrom` falls
 * back to matching the settings table's single-row key, which stopped being
 * unique the moment settings went per-organization — it now matches every row,
 * fails, and drops to Resend's shared sender, which delivers only to the
 * address the Resend account was registered with. An invite sent from there
 * reaches nobody and reports success.
 */
async function agencyOrgId(): Promise<string | undefined> {
  const { data, error } = await createAdminClient()
    .from("organizations")
    .select("id")
    .eq("kind", "agency")
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.error(
      "[auth/links] no agency organization found; the link email will go out from Resend's shared sender and probably not arrive",
      error,
    );
    return undefined;
  }

  return data.id;
}

function inviteBody(businessName: string, url: string): string {
  return [
    `An account has been set up for ${businessName}.`,
    "",
    "Choose a password to finish setting it up:",
    "",
    url,
    "",
    "The link works once. If it has already expired by the time you get to it, ask for a new one — nothing is lost.",
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");
}

function recoveryBody(businessName: string, url: string): string {
  return [
    `Someone asked to reset the password on the ${businessName} account.`,
    "",
    "Choose a new one here:",
    "",
    url,
    "",
    "The link works once. If it has already expired by the time you get to it, ask for a new one.",
    "",
    "If this wasn't you, ignore this email. Your password has not changed.",
  ].join("\n");
}

/**
 * Mints a single-use link and emails it.
 *
 * `invite` creates the account; `recovery` requires one to exist already. Both
 * land on the same page and end at the same password form, because from the
 * recipient's side there is no difference worth explaining: they have an
 * account and they need a password on it.
 */
export async function sendAuthLink(input: {
  email: string;
  kind: AuthLinkKind;
  /** Named in the subject line, so the recipient knows which account this is. */
  businessName: string;
}): Promise<AuthLinkResult> {
  const admin = createAdminClient();

  // Branched rather than passed a variable `type`: the two calls are separate
  // overloads and a union argument does not resolve against them.
  const generated =
    input.kind === "invite"
      ? await admin.auth.admin.generateLink({ type: "invite", email: input.email })
      : await admin.auth.admin.generateLink({
          type: "recovery",
          email: input.email,
        });

  const tokenHash = generated.data.properties?.hashed_token;
  const userId = generated.data.user?.id ?? null;

  if (generated.error || !tokenHash) {
    return {
      ok: false,
      error: generated.error?.message ?? "Supabase returned no token for the link.",
      userId,
    };
  }

  const url = confirmUrl(input.kind, tokenHash);

  const sent = await sendEmail({
    to: input.email,
    orgId: await agencyOrgId(),
    subject:
      input.kind === "invite"
        ? `Your ${input.businessName} account is ready`
        : `Reset your ${input.businessName} password`,
    text:
      input.kind === "invite"
        ? inviteBody(input.businessName, url)
        : recoveryBody(input.businessName, url),
  });

  if (!sent.ok) return { ok: false, error: sent.error, userId };

  // Non-null by here: `invite` creates the user and `recovery` only succeeds
  // for one that exists, so both paths came back with an id.
  return { ok: true, userId: userId! };
}
