import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { Logo } from "@/components/logo";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
        <AppSidebar email={user.email ?? "Signed in"} signOut={signOut} />
        <SidebarInset className="h-dvh min-w-0 overflow-hidden">
          {/* Only reason for a top bar: somewhere to hang the collapse control,
              which is the sidebar's only affordance on mobile. */}
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:hidden">
            <SidebarTrigger />
            <Logo className="h-6" />
          </div>
          {children}
        </SidebarInset>
        <Toaster position="top-center" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
