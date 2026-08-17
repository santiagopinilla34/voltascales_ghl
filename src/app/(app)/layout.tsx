import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { OrgContextProvider } from "@/components/orgs/org-context";
import { OrgShell } from "@/components/orgs/org-shell";
import { AppTopbar } from "@/components/topbar/app-topbar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/server";

import { signOut } from "./actions";

/**
 * Shell for every authenticated page.
 *
 * The proxy already redirects anonymous requests, but this re-checks on the
 * server so a page can never render without a verified user.
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    // Radix tooltips throw outside a provider, and both the thread timestamps
    // and the sidebar's collapsed-icon labels use them.
    <TooltipProvider>
      <SidebarProvider>
        {/* Wraps the sidebar as well as the page: the simulated sub-account
            context decides which nav items exist, not just what is drawn to
            the right of them. Front end only — see the module comment on
            `OrgContextProvider` for what a real switch would have to do. */}
        <OrgContextProvider>
          <AppSidebar email={user.email ?? "Signed in"} signOut={signOut} />
          <SidebarInset className="h-dvh min-w-0 overflow-hidden">
            <AppTopbar />
            <OrgShell>{children}</OrgShell>
          </SidebarInset>
        </OrgContextProvider>
        <Toaster position="top-center" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
