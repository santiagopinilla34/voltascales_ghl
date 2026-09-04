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
  Sparkles,
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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

type NavSection = { label: string; items: NavItem[] };

/**
 * Sixteen links in one unbroken column asked you to read the whole list every
 * time, because nothing in it said where one kind of page stopped and the next
 * began. The order was already grouped — the comments below were doing the
 * grouping in prose, for nobody — so the headings are less a change than an
 * admission of what the order had meant all along.
 *
 * Five sections, because five is what the list actually holds: the work
 * itself, the things that do the work for you, the infrastructure underneath,
 * the money, and everything left over.
 */
const NAV: NavSection[] = [
  {
    label: "Main",
    items: [
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/contacts", label: "Contacts", icon: Users },
      { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
      // After Pipeline because that is the order the work happens in: a booking
      // puts someone in the Booked column, and this is where you go to see it.
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/business", label: "My Business", icon: Briefcase },
    ],
  },
  {
    // The two are the same thought — work that happens without anyone doing
    // it — and the difference between them is worth seeing in the menu. An
    // automation follows a rule you wrote. An agent holds the conversation
    // itself, and what it says comes from how it was trained rather than from
    // a branch on a canvas.
    label: "Automation",
    items: [
      { href: "/automations", label: "Automations", icon: Bot },
      { href: "/ai-agents", label: "AI Agents", icon: Sparkles },
    ],
  },
  {
    // Infrastructure the CRM runs on: you buy a number or a domain once and
    // then forget about it. Email Services sits next to Domains rather than
    // next to Inbox because this is where a sending domain is provisioned —
    // something you do once alongside buying the domain it sits on, not
    // somewhere you go to read mail.
    label: "Tools",
    items: [
      { href: "/phone", label: "Phone System", icon: PhoneCall },
      { href: "/email", label: "Email Services", icon: AtSign },
      { href: "/domains", label: "Domains", icon: Globe },
    ],
  },
  {
    // Money out, then money in — the client's own Stripe account, read through
    // OAuth. Adjacent because people look for them together; named apart
    // because confusing the wallet they top up with the revenue they earn
    // would be a bad day for everyone. Sub Accounts is here because an agency
    // reaches for it while thinking about who is being billed for what.
    label: "Finance",
    items: [
      { href: "/billing", label: "Balance", icon: Wallet },
      { href: "/payments", label: "Payments", icon: CreditCard },
      {
        href: "/sub-accounts",
        label: "Sub Accounts",
        icon: Building2,
        platformOnly: true,
      },
    ],
  },
  {
    label: "Other",
    items: [
      { href: "/usage", label: "Usage", icon: Gauge, platformOnly: true },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
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
  //
  // A section that loses every item to the filter is dropped with them; a
  // heading over nothing is worse than no heading at all.
  const showAll = isPlatformAdmin && !isViewingOther;
  const sections = NAV.map((section) => ({
    ...section,
    items: showAll
      ? section.items
      : section.items.filter((item) => !item.platformOnly),
  })).filter((section) => section.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      {/* The brand's one green, used as light rather than as paint. It hangs
          off the top-right corner so it reads as arriving from outside the
          panel, and it goes first so everything else stacks over it —
          `sidebar-inner` paints the background, not this, so there is nothing
          here to cover the nav. */}
      <div
        aria-hidden
        className="sidebar-glow pointer-events-none absolute inset-0"
      />

      {/* No rule under the header and none over the footer. Both cards below
          are bordered, so the lines were drawing the same boundary twice —
          and three horizontal rules in a 256px column is most of what you see
          of it. The gutter is 20px rather than the primitive's 8: at 8 the
          rows sat on the panel edge and the column read as a list that had
          been pushed against the wall. */}
      <SidebarHeader className="gap-3 px-5 pt-4 pb-4 group-data-[collapsible=icon]:px-2">
        {/* The wordmark is five times as wide as it is tall, so it cannot
            survive the collapse to an icon rail; the bolt mark stands in for it
            there, at the same size as the nav icons underneath. */}
        {/* px-1 lines the wordmark up with the nav labels below, but the icon
            rail has only 32px to give and preflight's `max-width: 100%` would
            squash the mark to fit whatever is left of it. */}
        <div className="flex items-center px-1 py-1 group-data-[collapsible=icon]:px-0">
          <Logo className="h-7 group-data-[collapsible=icon]:hidden" />
          <LogoMark className="hidden size-7 group-data-[collapsible=icon]:block" />
        </div>

        {/* Which account this is, under the wordmark — where your eye already
            is when you reach for the nav. Passed in from the layout because it
            comes from the session, which a client component cannot read. */}
        {accountBadge}
      </SidebarHeader>

      <SidebarContent className="py-2">
        {sections.map((section) => (
          // The gap between sections lives on the group rather than under the
          // heading, so it survives the collapse to icons — where the headings
          // are gone and the grouping is all that is left of them.
          <SidebarGroup
            key={section.label}
            // px-5 here and on the header and footer, so the whole column
            // lines up on one gutter. The icon rail is 48px wide and cannot
            // pay 20 of them twice, hence the override.
            className="mt-3 px-5 py-0 first:mt-0 group-data-[collapsible=icon]:px-2"
          >
            <SidebarGroupLabel
              className={cn(
                "text-sidebar-foreground/45 h-6 px-2 text-[0.625rem] font-semibold tracking-[0.14em] uppercase",
                // The primitive's collapse animation assumes the default h-8.
                "group-data-[collapsible=icon]:-mt-6",
              )}
            >
              {section.label}
            </SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  // Prefix match so /inbox/<id> keeps Inbox highlighted.
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        // px-4 rather than the primitive's p-2: the icon wants
                        // air on its left now that the row is a pill sitting
                        // inside a gutter rather than a strip spanning the
                        // panel. The rail's own `p-2!` outranks it, so the
                        // collapsed icons stay centred in their 32px.
                        //
                        // The active pill is a lit surface, not a filled
                        // rectangle: a flat block of `--sidebar-accent` sat on
                        // the panel like a swatch. It now falls off towards
                        // the bottom the way a raised thing catches light, and
                        // the hairline runs around the whole of it — the two
                        // together are what make it read as sitting above the
                        // column rather than being cut out of it.
                        className={cn(
                          "rounded-lg px-4",
                          "data-active:from-sidebar-accent data-active:to-sidebar-accent/45 data-active:bg-gradient-to-b",
                          "data-active:ring-1 data-active:ring-white/10 dark:data-active:ring-white/12",
                        )}
                      >
                        <Link
                          href={item.href}
                          onClick={() => setOpenMobile(false)}
                        >
                          {/* The icon takes the brand green on the page you
                              are on. It is the same signal as the dot at the
                              other end of the row, and it is the one that
                              survives the collapse to the icon rail, where the
                              label and the dot are both gone. */}
                          <item.icon
                            className={cn(
                              active && "text-emerald-500 dark:text-emerald-400",
                            )}
                          />
                          <span className="flex-1 truncate">{item.label}</span>
                          {/* The one place green appears in the nav. The
                              filled row already says which page you are on;
                              this says it from the corner of the eye, without
                              another word of text. */}
                          {active && (
                            <span
                              aria-hidden
                              className="size-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_7px_1px] shadow-emerald-500/50 group-data-[collapsible=icon]:hidden"
                            />
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-5 pt-2 pb-4 group-data-[collapsible=icon]:px-2">
        {/* Boxed, like the account badge at the other end, so the column is
            bracketed by who you are and which account you are in, with the nav
            between them. The border comes off on the icon rail, where a box
            around one button is only clutter. */}
        <div className="flex flex-col gap-1.5 rounded-xl border p-2 group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:p-0">
          <span
            className="flex min-w-0 items-center gap-2 px-1 group-data-[collapsible=icon]:hidden"
            title={email}
          >
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_7px_1px] shadow-emerald-500/50"
            />
            <span className="text-muted-foreground truncate text-xs">
              {email}
            </span>
          </span>

          {/* Sign out and the theme toggle share a row so the toggle sits in
              the bottom-left corner without costing the footer another line.
              When the sidebar collapses to icons the label goes and the toggle
              stays, centred — it is an icon button already. */}
          <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
            <form
              action={signOut}
              className="flex-1 group-data-[collapsible=icon]:hidden"
            >
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
        </div>
      </SidebarFooter>

      {/* Collapse handle for desktop, where the mobile top bar is hidden. */}
      <SidebarRail />
    </Sidebar>
  );
}
