import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { AccountBadge } from "@/components/orgs/account-badge";
import { AccountSwitcher } from "@/components/orgs/account-switcher";
import { OrgBanner } from "@/components/orgs/org-banner";
import { AppTopbar } from "@/components/topbar/app-topbar";
import { PageTransition } from "@/components/page-transition";
import { VendorProvider } from "@/components/vendor";
import { listSubAccounts } from "@/lib/orgs/queries";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getOrgContext } from "@/lib/orgs/context";

import { signOut } from "./actions";

/**
 * Shell for every authenticated page.
 *
 * ## How wide a page is, and why
 *
 * Every page used to invent its own answer — `max-w-2xl` here, `3xl` there,
 * one `6xl` on Phone System — so the app changed shape as you moved through
 * it, and on anything wider than a laptop the result was a narrow ribbon of
 * content with a third of the window empty either side. That reads as a
 * template somebody filled in rather than a tool somebody built.
 *
 * Pages now share one container — `mx-auto w-full min-w-0 max-w-[1140px]` in a
 * scroll region with `px-4 sm:px-6 lg:px-10` — and, more importantly, use the
 * width they were given. Widening alone would only stretch the same single
 * column into long thin rows, which looks worse, so pages carrying independent
 * blocks put them side by side at `xl` and above.
 *
 * Three rules worth keeping when adding a page:
 *
 * - **Split by subject, not to fill space.** Two columns because the halves
 *   answer different questions, not because there was room.
 * - **Prose stays narrow.** A paragraph is comfortable at 65–75 characters and
 *   painful long before even this container's width. Wide containers are for
 *   structure — tables, cards, forms, panels — never for sentences. Where a
 *   page is mostly prose, two columns of readable measure beat one wide one.
 * - **Forms are what a wide container harms most.** A single-line input 1300px
 *   long is hard to use, not just ugly. Half a screen is a field; a whole one
 *   is a mistake.
 *
 * The 1140px cap is the second attempt. 1600px was the first, and on a normal
 * laptop it came out effectively full-bleed — the fix for a narrow ribbon read
 * as no margins at all. A cap wants real space either side of it, not just a
 * ceiling for the ultrawide case it was written for.
 *
 * The proxy already redirects anonymous requests, but this re-checks on the
 * server so a page can never render without a verified user.
 *
 * It now also resolves the organization. `getOrgContext` returns null for a
 * signed-in user with no membership — an account that exists in `auth.users`
 * and was never invited into anything, which is what happens if someone is
 * created in the Supabase dashboard by hand. That is a dead end rather than an
 * error, so it goes to a sign-out rather than rendering an app with nothing in
 * it and no explanation.
 *
 * The shell owns no scrolling of its own: `SidebarInset` is a flex column and
 * each page decides what scrolls inside it. The Inbox needs its two panes to
 * scroll independently against a fixed viewport, which a page-level scroll
 * container would make impossible.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getOrgContext();

  if (!context) {
    redirect("/login?error=" + encodeURIComponent(
      "That account isn't attached to any organization yet.",
    ));
  }

  // Suspended clients never reach the shell. The agency is exempt — see
  // `requireOrgContext`, which makes the same exception for the same reason.
  if (!context.isPlatformAdmin && context.orgStatus === "suspended") {
    redirect("/suspended");
  }

  // Only the agency gets a list to switch between. A client's query would
  // return their own organization and nothing else anyway, but there is no
  // reason to spend the round trip.
  const accounts = context.isPlatformAdmin ? await listSubAccounts() : [];

  return (
    // Radix tooltips throw outside a provider, and both the thread timestamps
    // and the sidebar's collapsed-icon labels use them.
    <TooltipProvider>
      {/* Decides whether the screens below name Twilio out loud. The agency
          sees the real names, including while working inside a client; a
          client sees "the phone network". See components/vendor.tsx. */}
      <VendorProvider isPlatformAdmin={context.isPlatformAdmin}>
      <SidebarProvider>
        <AppSidebar
          email={context.email || "Signed in"}
          signOut={signOut}
          isPlatformAdmin={context.isPlatformAdmin}
          isViewingOther={context.isViewingOther}
          // Rendered here rather than inside the sidebar: both read the
          // session, and the sidebar is a client component. An admin gets the
          // switcher; a client gets their name, because they have nowhere to
          // switch to.
          accountBadge={
            context.isPlatformAdmin ? (
              <AccountSwitcher
                currentOrgId={context.orgId}
                currentOrgName={context.orgName}
                agencyName="VoltaScales"
                isViewingOther={context.isViewingOther}
                accounts={accounts}
              />
            ) : (
              <AccountBadge
                name={context.orgName}
                isPlatformAdmin={false}
              />
            )
          }
        />
        <SidebarInset className="h-dvh min-w-0 overflow-hidden">
          <AppTopbar />
          {context.isViewingOther && <OrgBanner orgName={context.orgName} />}
          <PageTransition>{children}</PageTransition>
        </SidebarInset>
        <Toaster position="top-center" />
      </SidebarProvider>
      </VendorProvider>
    </TooltipProvider>
  );
}
