"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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

/**
 * The active pill moving from one link to the next.
 *
 * The same numbers as `SELECT_SPRING` in `components/inbox/motion.ts`, and the
 * same reasoning: this tracks a click the reader just made, so it has to keep
 * up with them rather than perform. Restated here rather than imported because
 * that module is the Inbox's vocabulary and the app shell should not reach into
 * a feature folder for its own motion — if either moves, the comment in the
 * other is the thing that says they were meant to match.
 *
 * Bounce stays low. A nav that springs is a nav that draws attention to itself
 * every time you go anywhere.
 */
const PILL_SPRING = { type: "spring", duration: 0.32, bounce: 0.1 } as const;

/** Where the active pill sits, in the nav scroller's own coordinates. */
type PillBox = { top: number; left: number; width: number; height: number };

/** The dot arriving and leaving. Shorter out than in — see EXIT_MS in the Inbox. */
const DOT_IN = { duration: 0.22, ease: [0.23, 1, 0.32, 1] } as const;
const DOT_OUT = { duration: 0.12, ease: [0.23, 1, 0.32, 1] } as const;

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
  const reduce = useReducedMotion();

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

  // Which link the pill belongs to. Prefix match so /inbox/<id> keeps Inbox lit.
  const activeHref =
    sections
      .flatMap((section) => section.items)
      .find(
        (item) =>
          pathname === item.href || pathname.startsWith(`${item.href}/`),
      )?.href ?? null;

  // Where to draw the pill, in the scroll container's own coordinates.
  //
  // Null until the first measurement and whenever no link matches the URL —
  // both render no pill at all, which is right: a nav with nothing selected
  // should not be showing a highlight parked on a guess.
  const [box, setBox] = useState<PillBox | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  // `useLayoutEffect`, so the measurement happens before paint and the pill
  // never shows up a frame late on the row it just left.
  useLayoutEffect(() => {
    function measure() {
      const container = navRef.current;
      const row = activeHref ? itemRefs.current.get(activeHref) : null;

      if (!container || !row) {
        setBox(null);
        return;
      }

      const c = container.getBoundingClientRect();
      const r = row.getBoundingClientRect();

      // Against the container's *content*, not the viewport: the pill is
      // absolutely positioned inside the scroller, so it has to be placed
      // where the row sits in the list rather than where it currently appears
      // on screen. Without the scroll offset the pill would drift by exactly
      // how far the nav happens to be scrolled.
      const next = {
        top: r.top - c.top + container.scrollTop,
        left: r.left - c.left + container.scrollLeft,
        width: r.width,
        height: r.height,
      };

      // Compared before setting, because this runs from a ResizeObserver and
      // an unconditional setState there is a loop waiting to happen.
      setBox((current) =>
        current &&
        current.top === next.top &&
        current.left === next.left &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
    }

    measure();

    // The row moves without the URL changing in two ways that matter: the rail
    // collapsing to icons (every row narrows) and the window resizing.
    // Observing the container catches both, and catches the font loading in
    // late as well.
    const observer = new ResizeObserver(measure);
    if (navRef.current) observer.observe(navRef.current);

    return () => observer.disconnect();
  }, [activeHref, sections.length]);

  return (
    // `dark` on the panel, not on the page: the nav column keeps the dark
    // theme whatever the app is set to, and only the content beside it
    // follows the toggle.
    //
    // A class rather than a second set of tokens, because everything in here
    // is already written against the theme — `border`, `text-muted-foreground`,
    // the account and footer cards, the `dark:` variants on the active pill.
    // Redefining the eight `--sidebar-*` variables would have repainted the
    // panel and left all of that reading as light-on-light. This way the
    // subtree resolves every variable the way it does in dark mode, which is
    // the mode it was designed in.
    //
    // Menus and tooltips opened from here are portalled to the body and so
    // still follow the app's theme. That is deliberate: they overlay the
    // content, not the panel.
    //
    // `text-sidebar-foreground` is repeated here on purpose. The primitive
    // sets it on the wrapper *above* the element this class lands on, so it
    // resolves against the light palette and every label that inherits its
    // colour — the nav, the account name, the wordmark — arrives near-black
    // on a near-black panel. Declaring it again inside the scope re-resolves
    // it against the dark one.
    <Sidebar collapsible="icon" className="dark text-sidebar-foreground">
      {/* The brand's one green, used as light rather than as paint. It hangs
          off the top-right corner so it reads as arriving from outside the
          panel, and it goes first so everything else stacks over it —
          `sidebar-inner` paints the background, not this, so there is nothing
          here to cover the nav. */}
      <div
        aria-hidden
        className="sidebar-glow pointer-events-none absolute inset-0 overflow-hidden"
      >
        {/* Three arcs of one circle whose centre is off the panel entirely,
            past the right edge and above the top — so what you get inside the
            column is three near-parallel sweeps rather than anything that
            reads as a ring. They are the same shape as the bloom above them,
            drawn instead of blurred, which is what stops the lower half of the
            column being an unbroken sheet.

            `slice` and a viewBox taller than most windows, so the curvature is
            the same on a laptop as on a 27-inch monitor: with `none` the arcs
            would flatten or bow as the window changed height, and a decoration
            that reshapes itself while you resize draws exactly the attention
            it is trying not to.

            Gone on the icon rail. At 48px the arcs are three short diagonal
            scratches behind the icons, which is noise, not depth. */}
        <svg
          viewBox="0 0 256 1000"
          preserveAspectRatio="xMinYMin slice"
          className="absolute inset-0 size-full group-data-[collapsible=icon]:hidden"
        >
          <defs>
            <linearGradient
              id="sidebar-arc"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2="1000"
            >
              <stop
                offset="0%"
                stopColor="oklch(0.8 0.17 162)"
                stopOpacity="0.3"
              />
              <stop
                offset="55%"
                stopColor="oklch(0.8 0.17 162)"
                stopOpacity="0.14"
              />
              <stop
                offset="100%"
                stopColor="oklch(0.8 0.17 162)"
                stopOpacity="0.03"
              />
            </linearGradient>
          </defs>

          {/* The centre sits level with the middle of the column, not with the
              top of it. An arc is closest to the panel at its centre's height,
              and with the centre up by the header the innermost one crossed
              the wordmark — a hairline through the logo, which is the one
              thing here that has to stay clean. At this height the arcs reach
              their leftmost point around the section headings and leave both
              the brand and the footer card alone. */}
          <g fill="none" stroke="url(#sidebar-arc)" strokeWidth="1">
            <circle cx="392" cy="400" r="268" />
            <circle cx="392" cy="400" r="404" />
            <circle cx="392" cy="400" r="560" />
          </g>
        </svg>
      </div>

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

      {/* `relative`, because the travelling pill below is positioned against
          this box and scrolls with it. */}
      <SidebarContent asChild className="relative py-2">
        <div ref={navRef}>
          {/* The active pill, drawn once for the whole nav and moved.

              Deliberately *not* a `layoutId` shared between the rows, which is
              the obvious way to write this and does not work here: Framer's
              layout projection stalls in this tree — it applies the correct
              starting transform and never animates it back to zero, leaving
              the pill parked over the link you just left. The same stall
              affects the Inbox's selected-conversation marker, which is
              written that way and has the same symptom, so this is a property
              of the app rather than of this component.

              Measuring the row and animating `y`/`height` sidesteps projection
              entirely. It is a plain transform animation on one element that
              never unmounts, which is the thing Framer is most reliable at,
              and it survives the collapse to the icon rail and a window resize
              because the measurement re-runs on both. */}
          <AnimatePresence initial={false}>
            {box && (
              <motion.div
                aria-hidden
                key="nav-pill"
                initial={
                  reduce
                    ? { opacity: 0, y: box.top, height: box.height }
                    : { opacity: 0, y: box.top, height: box.height }
                }
                animate={{ opacity: 1, y: box.top, height: box.height }}
                exit={{ opacity: 0 }}
                transition={reduce ? { duration: 0 } : PILL_SPRING}
                style={{ left: box.left, width: box.width }}
                className={cn(
                  "pointer-events-none absolute top-0 rounded-lg",
                  "from-sidebar-accent to-sidebar-accent/45 bg-gradient-to-b",
                  "ring-1 ring-white/10 dark:ring-white/12",
                )}
              />
            )}
          </AnimatePresence>

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
                      <SidebarMenuItem
                        key={item.href}
                        // Measured by the pill above. Registered rather than
                        // queried by selector so the measurement never depends
                        // on the primitive's markup staying the shape it is.
                        ref={(el) => {
                          if (el) itemRefs.current.set(item.href, el);
                          else itemRefs.current.delete(item.href);
                        }}
                      >
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
                          //
                          // That surface is drawn by the motion.div above rather
                          // than here, so it can travel between rows. Two things
                          // follow. The primitive's own `data-active` fill is
                          // turned off, or the row would carry a stationary
                          // block of the same colour and the pill would appear
                          // to slide out from underneath a copy of itself. And
                          // the row is raised above the pill, since a positioned
                          // sibling would otherwise paint straight over the
                          // label and the icon.
                          className={cn(
                            "relative z-10 rounded-lg px-4",
                            "data-active:bg-transparent",
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
                            {/* The colour change is left to CSS, which is what
                              a colour change is for. Only the pill and the dot
                              need Framer. */}
                            <item.icon
                              className={cn(
                                "transition-colors duration-200",
                                active &&
                                  "text-emerald-500 dark:text-emerald-400",
                              )}
                            />
                            <span className="flex-1 truncate">
                              {item.label}
                            </span>
                            {/* The one place green appears in the nav. The
                              filled row already says which page you are on;
                              this says it from the corner of the eye, without
                              another word of text.

                              In `AnimatePresence` because the interesting half
                              is the leaving one: a `{active && …}` dot is
                              simply gone on the next render, and a light that
                              cuts out is the one thing on the row that does
                              not travel with the pill. Now it shrinks away
                              while the new one grows in, which is the same
                              gesture the pill is making, at the same moment.

                              Scale rather than movement, so reduced motion
                              only has to drop the scale and keep the fade. */}
                            <AnimatePresence initial={false}>
                              {active && (
                                <motion.span
                                  key="active-dot"
                                  aria-hidden
                                  initial={
                                    reduce
                                      ? { opacity: 0 }
                                      : { opacity: 0, transform: "scale(0.4)" }
                                  }
                                  animate={
                                    reduce
                                      ? { opacity: 1 }
                                      : { opacity: 1, transform: "scale(1)" }
                                  }
                                  exit={
                                    reduce
                                      ? { opacity: 0 }
                                      : { opacity: 0, transform: "scale(0.4)" }
                                  }
                                  transition={reduce ? DOT_OUT : DOT_IN}
                                  className="size-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_7px_1px] shadow-emerald-500/50 group-data-[collapsible=icon]:hidden"
                                />
                              )}
                            </AnimatePresence>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </div>
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
