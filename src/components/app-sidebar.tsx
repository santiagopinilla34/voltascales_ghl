"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Inbox, Settings, Users, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const NAV = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/automations", label: "Automations", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppSidebar({
  email,
  signOut,
}: {
  email: string;
  /** Server Action passed down from the layout. */
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-1 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-md">
            <Zap className="size-4" />
          </div>
          <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            VoltaScales
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                // Prefix match so /inbox/<id> keeps Inbox highlighted.
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <div className="flex flex-col gap-1 group-data-[collapsible=icon]:hidden">
          <span className="text-muted-foreground truncate px-2 text-xs" title={email}>
            {email}
          </span>
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground w-full justify-start"
            >
              Sign out
            </Button>
          </form>
        </div>
      </SidebarFooter>

      {/* Collapse handle for desktop, where the mobile top bar is hidden. */}
      <SidebarRail />
    </Sidebar>
  );
}
