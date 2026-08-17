import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { AccountBadge } from "@/components/orgs/account-badge";
import { AppTopbar } from "@/components/topbar/app-topbar";
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

  return (
    // Radix tooltips throw outside a provider, and both the thread timestamps
    // and the sidebar's collapsed-icon labels use them.
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          email={context.email || "Signed in"}
          signOut={signOut}
          isPlatformAdmin={context.isPlatformAdmin}
          // Rendered here rather than inside the sidebar: it reads the session,
          // and the sidebar is a client component.
          accountBadge={
            <AccountBadge
              name={context.orgName}
              isPlatformAdmin={context.isPlatformAdmin}
            />
          }
        />
        <SidebarInset className="h-dvh min-w-0 overflow-hidden">
          <AppTopbar />
          {children}
        </SidebarInset>
        <Toaster position="top-center" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
