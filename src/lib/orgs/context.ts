import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Who is asking, and on whose behalf.
 *
 * Replaces the browser-held simulation in `components/orgs/org-context.tsx`.
 * The difference is not cosmetic: that one was a value the browser set and the
 * server never saw, and this one is derived from the session on every request.
 *
 * ## Why the cookie is not a security boundary
 *
 * A platform admin can be looking at any organization, and that choice has to
 * live somewhere between requests — here, a cookie. Forging it gets you
 * nothing:
 *
 *   - For an `org_owner` the cookie is ignored outright. Their organization is
 *     whichever one their membership row names, and a second membership is
 *     something only the agency can create.
 *   - For a `platform_admin` the cookie only narrows a view of data they are
 *     already entitled to by role. Postgres would hand them those rows anyway.
 *
 * So the cookie chooses a lens, never a permission. Row-level security decides
 * what is behind it, and the check that matters happens in the database.
 */

/** Which organization a platform admin is currently looking at. */
const VIEWING_COOKIE = "voltascales-viewing-org";

export type OrgRole = "platform_admin" | "org_owner";

export type OrgStatus = "invited" | "active" | "suspended";

export type OrgContext = {
  userId: string;
  email: string;
  role: OrgRole;
  /** True for the agency. Decides the nav, the switcher and the guarded routes. */
  isPlatformAdmin: boolean;
  /** The organization whose data this request is about. */
  orgId: string;
  orgName: string;
  orgStatus: OrgStatus;
  /**
   * True when an admin is looking at a client rather than at the agency. Drives
   * the banner. Always false for a client, who has nothing else to look at.
   */
  isViewingOther: boolean;
};

/**
 * The caller's context, or null when there is no session or no membership.
 *
 * A signed-in user with no `org_members` row is a real state — an account that
 * exists in `auth.users` and was never invited into anything, which is exactly
 * what `test@test.com` became after phase 1. They get null, and the layout
 * turns that into a sign-out rather than an empty app.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // RLS on org_members lets you read your own rows, so this needs no
  // service-role escalation.
  const { data: memberships, error } = await supabase
    .from("org_members")
    .select("org_id, role, organizations (id, name, status)")
    .eq("user_id", user.id);

  if (error) {
    console.error("[orgs] membership lookup failed", error);
    return null;
  }

  const membership = memberships?.[0];
  if (!membership) return null;

  const isPlatformAdmin = memberships.some((m) => m.role === "platform_admin");
  const home = {
    id: membership.org_id,
    name: membership.organizations?.name ?? "Your account",
    status: (membership.organizations?.status ?? "active") as OrgStatus,
  };

  if (!isPlatformAdmin) {
    // A client is their organization. No cookie is consulted, so there is
    // nothing to forge.
    return {
      userId: user.id,
      email: user.email ?? "",
      role: "org_owner",
      isPlatformAdmin: false,
      orgId: home.id,
      orgName: home.name,
      orgStatus: home.status,
      isViewingOther: false,
    };
  }

  const viewing = (await cookies()).get(VIEWING_COOKIE)?.value;

  if (viewing && viewing !== home.id) {
    // Resolved rather than trusted: a cookie naming an organization that was
    // deleted, or was never one, falls back to the agency instead of leaving
    // the app pointed at nothing.
    const { data: target } = await supabase
      .from("organizations")
      .select("id, name, status")
      .eq("id", viewing)
      .maybeSingle();

    if (target) {
      return {
        userId: user.id,
        email: user.email ?? "",
        role: "platform_admin",
        isPlatformAdmin: true,
        orgId: target.id,
        orgName: target.name,
        orgStatus: target.status as OrgStatus,
        isViewingOther: true,
      };
    }
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    role: "platform_admin",
    isPlatformAdmin: true,
    orgId: home.id,
    orgName: home.name,
    orgStatus: home.status,
    isViewingOther: false,
  };
}

/**
 * The context, or a redirect.
 *
 * For pages that cannot render without knowing the organization, which is all
 * of them inside the app shell.
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const context = await getOrgContext();

  if (!context) redirect("/login");

  // A suspended client gets the notice instead of the app. The agency is
  // deliberately exempt: suspending an account is something you need to be
  // able to undo from inside, and locking yourself out of a client you just
  // suspended would make unsuspending them impossible.
  //
  // This is a door, not a wall. It stops a client using the app; it does not
  // stop their automations replying to a text, because those run from webhooks
  // that do not yet know which organization they are acting for. Suspension
  // becomes a real stop in phase 4, alongside the caps.
  if (!context.isPlatformAdmin && context.orgStatus === "suspended") {
    redirect("/suspended");
  }

  return context;
}

/**
 * The context, or a redirect, for pages only the agency may open.
 *
 * A real check on the server, unlike the `platformOnly` flag in the sidebar,
 * which only decides whether a link is drawn. Sub Accounts and Usage are the
 * two.
 */
export async function requirePlatformAdmin(): Promise<OrgContext> {
  const context = await requireOrgContext();

  if (!context.isPlatformAdmin) redirect("/inbox");

  return context;
}

export { VIEWING_COOKIE };
