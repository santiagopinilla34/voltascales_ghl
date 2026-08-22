"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AtSign,
  Bot,
  Briefcase,
  Building2,
  CalendarDays,
  CreditCard,
  FileText,
  Gauge,
  Globe,
  Wallet,
  Inbox,
  KanbanSquare,
  PhoneCall,
  Settings,
  Users,
  type LucideIcon,
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
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Belongs to the agency, not to a client.
   *
   * This hides the link; it is no longer the only thing standing in the way.
   * Both routes now call `requirePlatformAdmin()` on the server and redirect a
   * client who types the URL, so this is back to being what nav filtering
   * should be — a tidier menu, not a security control.
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
  // Money. Sits with the infrastructure it pays for rather than under Settings:
  // a client comes here because their number stopped working, and that is a
  // phone-system thought, not a preferences one.
  { href: "/billing", label: "Balance", icon: Wallet },
  // Money in, as opposed to Balance's money out — the client's own Stripe
  // account, read through OAuth. Adjacent because both are money and people
  // look for them together; named apart because confusing the wallet they top
  // up with the revenue they earn would be a bad day for everyone.
  { href: "/payments", label: "Payments", icon: CreditCard },
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
  isPlatformAdmin,
  isViewingOther,
  accountBadge,
}: {
  email: string;
  /** Server Action passed down from the layout. */
  signOut: () => Promise<void>;
  /** From the session, not from the browser. */
  isPlatformAdmin: boolean;
  /** True when the agency is working inside a client account. */
  isViewingOther: boolean;
  /** Rendered on the server, so the sidebar stays a client component. */
  accountBadge: React.ReactNode;
}) {
  const pathname = usePathname();
  // On a phone the sidebar is a sheet over the page, and tapping a link
  // navigated without shutting it. See the onClick below.
  const { setOpenMobile } = useSidebar();

  // A client's nav is the agency's minus the agency's own pages — and so is
  // the agency's, while it is working inside a client, because those pages are
  // not part of that account. Filtered rather than kept as a second list: two
  // lists drift, and the difference between the views *is* this flag.
  //
  // The switcher and the banner are how you get back out, which is why neither
  // is filtered away with the rest.
  const items =
    isPlatformAdmin && !isViewingOther
      ? NAV
      : NAV.filter((item) => !item.platformOnly);

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

        {/* Which account this is, under the wordmark — where your eye already
            is when you reach for the nav. Passed in from the layout because it
            comes from the session, which a client component cannot read. */}
        {accountBadge}
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
                      <Link href={item.href} onClick={() => setOpenMobile(false)}>
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
