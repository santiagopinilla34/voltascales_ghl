"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Briefcase,
  FileText,
  Gauge,
  Inbox,
  KanbanSquare,
  Settings,
  Users,
  Zap,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
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
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/business", label: "My Business", icon: Briefcase },
  { href: "/automations", label: "Automations", icon: Bot },
  { href: "/usage", label: "Usage", icon: Gauge },
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
        <span
          className="text-muted-foreground truncate px-2 text-xs group-data-[collapsible=icon]:hidden"
          title={email}
        >
          {email}
        </span>

        {/* Sign out and the theme toggle share a row so the toggle sits in the
            bottom-left corner without costing the footer another line. When the
            sidebar collapses to icons the label goes and the toggle stays,
            centred — it is an icon button already. */}
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <form action={signOut} className="flex-1 group-data-[collapsible=icon]:hidden">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground w-full justify-start"
            >
              Sign out
            </Button>
          </form>
          <ThemeToggle />
        </div>
      </SidebarFooter>

      {/* Collapse handle for desktop, where the mobile top bar is hidden. */}
      <SidebarRail />
    </Sidebar>
  );
}
