import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { AccountBadge } from "@/components/orgs/account-badge";
import { AccountSwitcher } from "@/components/orgs/account-switcher";
import { OrgBanner } from "@/components/orgs/org-banner";
import { AppTopbar } from "@/components/topbar/app-topbar";
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
          {children}
        </SidebarInset>
        <Toaster position="top-center" />
      </SidebarProvider>
      </VendorProvider>
    </TooltipProvider>
  );
}
