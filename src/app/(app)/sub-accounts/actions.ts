"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

import { sendAuthLink } from "@/lib/auth/links";
import { requirePlatformAdmin } from "@/lib/orgs/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Creating client accounts, and moving between them.
 *
 * Two different clients are used here on purpose. Everything that can run as
 * the signed-in admin does, so row-level security is the thing deciding
 * whether it is allowed — creating an organization, writing a membership and
 * seeding are all refused by Postgres for anyone who is not the agency.
 *
 * Only the invite escalates, because creating an auth user is not something
 * RLS has an opinion about; it needs the service role. That call is fenced
 * behind `requirePlatformAdmin()` and does exactly one thing.
 */

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A URL-safe slug for the booking link.
 *
 * Collisions are resolved with a numeric suffix rather than rejected: two
 * clients called "Precision Plumbing" is a Tuesday, not a mistake worth making
 * the agency resolve by hand.
 */
async function uniqueSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "client";

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;

    const { data } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (!data) return candidate;
  }

  // Fifty "precision-plumbing"s is not a naming collision any more.
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Creates a client organization and invites its owner.
 *
 * The client sets their own password from the emailed link. Nobody at the
 * agency ever chooses or sees it, which is the point: holding a client's
 * password means holding the ability to act as them, and that is a liability
 * rather than a feature.
 *
 * Not transactional across the two systems, and it cannot be — the auth user
 * lives in Supabase's own tables and the organization lives in yours. The
 * order below fails in the least destructive direction: if the invite fails,
 * the organization is deleted again; if the membership fails after the invite,
 * the account exists but belongs to nothing, which is visible and fixable.
 */
export async function createSubAccount(input: {
  businessName: string;
  clientEmail: string;
}): Promise<ActionResult<{ id: string }>> {
  await requirePlatformAdmin();

  const name = input.businessName.trim();
  const email = input.clientEmail.trim().toLowerCase();

  if (!name) return { ok: false, error: "Enter the client's business name." };
  if (!EMAIL.test(email)) {
    return { ok: false, error: `"${email}" doesn't look like an email address.` };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const slug = await uniqueSlug(supabase, name);

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name,
      slug,
      kind: "client",
      status: "invited",
      invited_email: email,
    })
    .select("id")
    .single();

  if (orgError || !org) {
    return { ok: false, error: orgError?.message ?? "Could not create the account." };
  }

  // An address that already has an account is not an error worth failing on —
  // it is a client you invited before, or someone who signed up another way.
  // They get a membership instead of a second account.
  const existing = await admin.auth.admin.listUsers();
  const already = existing.data?.users.find(
    (user) => user.email?.toLowerCase() === email,
  );

  let userId = already?.id ?? null;

  if (!userId) {
    const invited = await sendAuthLink({
      email,
      kind: "invite",
      businessName: name,
    });

    if (!invited.ok) {
      // Undo the organization so a failed invite doesn't leave a client
      // account nobody can get into and nobody remembers creating. The auth
      // user goes with it when the link was minted and only the email failed —
      // otherwise the address is taken, and a second attempt at the same
      // client would silently skip the invite and mail them nothing.
      await supabase.from("organizations").delete().eq("id", org.id);
      if (invited.userId) {
        await admin.auth.admin.deleteUser(invited.userId);
      }
      return {
        ok: false,
        error: `Could not send the invite: ${invited.error}`,
      };
    }

    userId = invited.userId;
  }

  const { error: memberError } = await supabase
    .from("org_members")
    .insert({ org_id: org.id, user_id: userId, role: "org_owner" });

  if (memberError) {
    return {
      ok: false,
      error: `Account created and invite sent, but linking the owner failed: ${memberError.message}`,
    };
  }

  // Settings row and the system automations. A client whose booking
  // confirmation does not exist has an account that silently does nothing.
  const { error: seedError } = await supabase.rpc("seed_organization", {
    target: org.id,
  });

  if (seedError) {
    return {
      ok: false,
      error: `Account created, but seeding its defaults failed: ${seedError.message}`,
    };
  }

  revalidatePath("/sub-accounts");
  return { ok: true, value: { id: org.id } };
}

/**
 * Points the agency at a client organization.
 *
 * A client never reaches this. `requirePlatformAdmin` sends them to their own
 * inbox, and the policy on `active_org` refuses a row written for anyone but
 * yourself in any case.
 */
export async function switchToOrg(orgId: string): Promise<void> {
  const context = await requirePlatformAdmin();

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) redirect("/sub-accounts");

  // One row re-aims the entire app: the RLS policies read `active_org_id()` on
  // every query, so no page and no query has to know this happened. That is
  // the difference from the cookie it replaces, which Postgres never saw.
  const { error } = await supabase.from("active_org").upsert(
    { user_id: context.userId, org_id: orgId, set_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[orgs] could not switch organization", error);
    redirect("/sub-accounts");
  }

  revalidatePath("/", "layout");
  redirect("/inbox");
}

/**
 * Pauses or restores a client's access.
 *
 * What non-payment calls for, and the reason deleting a client account is
 * blocked outright at the database. The data stays put, the client stops
 * getting in, and it reverses in one click when they pay.
 *
 * Stops the sending as well as the signing in: the automations engine, the AI
 * reply and the booking reminders all check `isOrgSuspended` before they spend
 * anything. A pause that kept answering texts on the agency's Twilio account
 * would be the wrong way round for the one thing it exists to handle.
 */
export async function setSubAccountStatus(
  orgId: string,
  status: "active" | "suspended",
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const supabase = await createClient();

  // `kind` guards against pausing the agency itself, which would lock you out
  // of the page you would need to undo it from.
  const { error } = await supabase
    .from("organizations")
    .update({ status })
    .eq("id", orgId)
    .eq("kind", "client");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/sub-accounts");
  return { ok: true, value: null };
}

/**
 * Monthly caps for one client.
 *
 * Empty means uncapped; zero means stopped. Stored on `organizations` because
 * that table is agency-writable only — the same values on `settings` would be
 * a limit the client could raise on themselves.
 *
 * Recorded, not yet enforced. Every send runs through a webhook on the service
 * role with no idea which organization it belongs to, so there is nothing to
 * check a cap against until phase 4.
 */
export async function setSubAccountLimits(
  orgId: string,
  limits: {
    monthlySms: number | null;
    monthlyEmail: number | null;
    monthlyAiCents: number | null;
  },
): Promise<ActionResult> {
  await requirePlatformAdmin();

  for (const [label, value] of Object.entries(limits)) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      return { ok: false, error: `${label} must be a whole number, or blank for no limit.` };
    }
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("organizations")
    .update({
      monthly_sms_limit: limits.monthlySms,
      monthly_email_limit: limits.monthlyEmail,
      monthly_ai_cents_limit: limits.monthlyAiCents,
    })
    .eq("id", orgId)
    .eq("kind", "client");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/sub-accounts");
  return { ok: true, value: null };
}

/**
 * Emails a client a link to set a new password.
 *
 * The same shape as the invite, and for the same reason: the agency never
 * chooses or sees the password, so a forgotten one is reset by the person who
 * owns it rather than handed over in a message. There is nothing here that
 * reveals whether the reset worked at the other end, which is correct — the
 * mailbox is the proof.
 *
 * Sent to the address the invite went to, not to one typed at the time, so a
 * misclick cannot mail a reset link for a client's account to somebody else.
 */
export async function sendPasswordReset(orgId: string): Promise<ActionResult> {
  await requirePlatformAdmin();

  const supabase = await createClient();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("name, invited_email")
    .eq("id", orgId)
    .eq("kind", "client")
    .maybeSingle();

  if (orgError) return { ok: false, error: orgError.message };
  if (!org?.invited_email) {
    return {
      ok: false,
      error: "No email is on file for this account, so there is nowhere to send a reset.",
    };
  }

  // Not `resetPasswordForEmail`, which would send Supabase's own email with
  // Supabase's own link in it — the one a mail scanner spends on delivery.
  // Same reasoning as the invite above; it is written out in lib/auth/links.ts.
  const sent = await sendAuthLink({
    email: org.invited_email,
    kind: "recovery",
    businessName: org.name,
  });

  if (!sent.ok) return { ok: false, error: sent.error };

  return { ok: true, value: null };
}

/** Back to the agency's own account. */
export async function returnToAgency(): Promise<void> {
  const context = await requirePlatformAdmin();

  const supabase = await createClient();

  // Deleted rather than pointed at the agency: `active_org_id()` already falls
  // back to the agency when there is no row, so "no row" and "the agency" are
  // the same state and keeping one of them is enough.
  const { error } = await supabase
    .from("active_org")
    .delete()
    .eq("user_id", context.userId);

  if (error) console.error("[orgs] could not return to the agency", error);

  revalidatePath("/", "layout");
  redirect("/sub-accounts");
}
