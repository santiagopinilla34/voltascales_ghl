"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AtSign,
  Bot,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  Gauge,
  Globe,
  Inbox,
  KanbanSquare,
  PhoneCall,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Logo, LogoMark } from "@/components/logo";
import { useOrgContext } from "@/components/orgs/org-context";
import { subAccountInitials } from "@/lib/orgs/sub-accounts";
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

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Belongs to the platform admin, not to a client. Hidden while a sub account
   * is open — which is nav filtering and nothing more. There are no roles yet,
   * so the routes stay reachable by typing them; what stops you seeing client
   * data on them is that the simulated account has no data at all.
   */
  platformOnly?: boolean;
};

const NAV: NavItem[] = [
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
  // The two platform-level pages, kept adjacent so that in client view they
  // disappear together and what is left still reads as a deliberate list
  // rather than one with holes punched in it.
  { href: "/sub-accounts", label: "Sub Accounts", icon: Building2, platformOnly: true },
  { href: "/usage", label: "Usage", icon: Gauge, platformOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({
  email,
  signOut,
}: {
  email: string;
  /** Server Action passed down from the layout. */
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const { org } = useOrgContext();

  // Client view is exactly the platform view minus the platform's own pages.
  // Filtered rather than kept as a second list: two lists drift, and the
  // difference between the roles *is* this flag.
  const items = org ? NAV.filter((item) => !item.platformOnly) : NAV;

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

        {/* Whose account this is, under the wordmark. The banner across the top
            says it in words; this says it where your eye already is when you
            reach for the nav, and it survives the collapse to icons as the
            initials on their own. */}
        {org && (
          <div className="flex min-w-0 items-center gap-2 rounded-md bg-violet-100 px-2 py-1.5 text-violet-900 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 dark:bg-violet-950/60 dark:text-violet-200">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[9px] font-semibold text-white">
              {subAccountInitials(org.name)}
            </span>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-medium" title={org.name}>
                {org.name}
              </p>
              <p className="text-[10px] opacity-75">Client view · simulated</p>
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
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
