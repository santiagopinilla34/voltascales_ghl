"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AtSign,
  Bot,
  Briefcase,
  CalendarDays,
  FileText,
  Gauge,
  Globe,
  Inbox,
  KanbanSquare,
  PhoneCall,
  Settings,
  Users,
} from "lucide-react";

import { Logo, LogoMark } from "@/components/logo";
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
  // After Pipeline because that is the order the work happens in: a booking
  // puts someone in the Booked column, and this is where you go to see it.
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/business", label: "My Business", icon: Briefcase },
  { href: "/automations", label: "Automations", icon: Bot },
  // Infrastructure the CRM runs on, grouped after the day-to-day pages: you
  // buy a number or a domain once and then forget about it.
  { href: "/phone", label: "Phone System", icon: PhoneCall },
  // Next to Domains rather than next to Inbox: this is where a sending domain
  // is provisioned, which is a thing you do once alongside buying the domain
  // it sits on — not somewhere you go to read mail.
  { href: "/email", label: "Email Services", icon: AtSign },
  { href: "/domains", label: "Domains", icon: Globe },
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
        {/* The wordmark is five times as wide as it is tall, so it cannot
            survive the collapse to an icon rail; the bolt mark stands in for it
            there, at the same size as the nav icons underneath. */}
        {/* px-1 lines the wordmark up with the nav labels below, but the icon
            rail has only 32px to give and preflight's `max-width: 100%` would
            squash the mark to fit whatever is left of it. */}
        <div className="flex items-center px-1 py-1.5 group-data-[collapsible=icon]:px-0">
          <Logo className="h-7 group-data-[collapsible=icon]:hidden" />
          <LogoMark className="hidden size-7 group-data-[collapsible=icon]:block" />
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
