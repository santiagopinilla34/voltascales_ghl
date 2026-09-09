import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Who is asking, and on whose behalf.
 *
 * The organization an admin is working in lives in `active_org`, a table, and
 * that is what makes this real rather than decorative. Phase 2 kept it in a
 * cookie, which the database never saw — so it could only narrow what the app
 * chose to ask for, and any query that forgot to filter returned every
 * tenant's rows. Now the RLS policies read `active_org_id()` themselves, so
 * the scope applies to all seventy-odd queries in the app without any of them
 * mentioning it, including ones not written yet.
 *
 * What this function does is therefore only to *report* the scope, for the nav
 * and the banner. Getting it wrong would draw the wrong name on the screen; it
 * could not show anyone another tenant's data.
 *
 * For a client none of it applies: their organization is whichever one their
 * membership names, `active_org` is never consulted, and a row written there
 * for them would do nothing.
 */

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
/**
 * Wrapped in React's `cache`, which deduplicates it for the life of one server
 * render — every caller in a single request shares the first call's result.
 *
 * This is a performance fix and nothing else; the value is identical either
 * way. It is worth the wrapper because of how often the answer was recomputed:
 * the app shell asks, and then the page inside it asks again through
 * `requireOrgContext`, so every render of every route ran this twice. Each run
 * is an `auth.getUser()` — a network call to Supabase Auth, which validates the
 * JWT against the server rather than decoding it locally — plus a membership
 * query and, for an admin, an `active_org` read on top.
 *
 * That duplication is paid on every navigation and, in the Inbox, on every
 * inbound message: `router.refresh()` re-renders the whole shell, so a busy
 * conversation was spending an extra auth round trip per text for an answer it
 * already had.
 *
 * `cache` is per-request and does not persist between them, which is what keeps
 * this safe. Two users' renders never share an entry, and a scope changed by
 * the account switcher is a new request and so a new lookup — there is no
 * window in which this can report a stale organization.
 */
export const getOrgContext = cache(async function getOrgContext(): Promise<OrgContext | null> {
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
    // Deliberately not null. Null is the answer for a user who *has* no
    // membership, and the layout turns that into a sign-out — but a lookup
    // that failed established nothing about their membership, and reading
    // "I could not ask" as "you are not a member" signs people out over a
    // transient database error. That is what turned the last second of clock
    // skew into a bounce through /login: the query was refused, this returned
    // null, and the app concluded the operator had no account. Throwing keeps
    // the two apart.
    console.error("[orgs] membership lookup failed", error);
    throw new Error(`Membership lookup failed: ${error.message}`);
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

  const { data: active } = await supabase
    .from("active_org")
    .select("org_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const viewing = active?.org_id;

  if (viewing && viewing !== home.id) {
    // `organizations` is deliberately not scoped by active_org — the agency
    // needs to list every client to switch between them — so this reads the
    // target directly.
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
});

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
  // This is the front door only, and it is no longer the whole of it — the
  // send paths check `isOrgSuspended` too, so a paused account's automations,
  // AI replies and booking reminders are held as well. Without that half, a
  // suspension for non-payment would keep spending the agency's Twilio and
  // Anthropic budget on the client who stopped paying.
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

