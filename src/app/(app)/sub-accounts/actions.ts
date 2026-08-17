"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { appBaseUrl } from "@/lib/env";
import { VIEWING_COOKIE, requirePlatformAdmin } from "@/lib/orgs/context";
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
    const redirectTo = `${appBaseUrl() ?? "http://localhost:3000"}/auth/confirm?next=/auth/set-password`;

    const invited = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });

    if (invited.error || !invited.data.user) {
      // Undo the organization so a failed invite doesn't leave a client
      // account nobody can get into and nobody remembers creating.
      await supabase.from("organizations").delete().eq("id", org.id);
      return {
        ok: false,
        error: `Could not send the invite: ${invited.error?.message ?? "unknown error"}`,
      };
    }

    userId = invited.data.user.id;
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
 * Points the agency's session at a client organization.
 *
 * The cookie chooses a lens, not a permission — see the comment on
 * `getOrgContext`. A client never reaches this: `requirePlatformAdmin` sends
 * them back to their own inbox.
 */
export async function switchToOrg(orgId: string): Promise<void> {
  await requirePlatformAdmin();

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) redirect("/sub-accounts");

  const store = await cookies();
  store.set(VIEWING_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  revalidatePath("/", "layout");
  redirect("/inbox");
}

/** Back to the agency's own account. */
export async function returnToAgency(): Promise<void> {
  await requirePlatformAdmin();

  const store = await cookies();
  store.delete(VIEWING_COOKIE);

  revalidatePath("/", "layout");
  redirect("/sub-accounts");
}
