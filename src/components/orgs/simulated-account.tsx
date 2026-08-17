"use client";

import { usePathname } from "next/navigation";
import {
  AtSign,
  Bot,
  Briefcase,
  CalendarDays,
  FileText,
  Globe,
  Inbox,
  KanbanSquare,
  Lock,
  PhoneCall,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useOrgContext } from "@/components/orgs/org-context";
import { Button } from "@/components/ui/button";

/**
 * What every page looks like inside a simulated sub account.
 *
 * A brand-new client account has nothing in it, so this is a set of empty
 * states — one per page in the client's nav — drawn entirely in the browser.
 *
 * ## Why the shell replaces the page rather than the page emptying itself
 *
 * Every real page is a Server Component that queries Supabase. Making one
 * return nothing for a client account would mean giving the server a notion of
 * which organization is asking, and that is the backend work this is explicitly
 * standing in front of. So the shell renders this instead of the page while a
 * sub account is open, and the account you are "inside" is guaranteed empty
 * because there is no query behind it at all.
 *
 * The honest limitation: the real page still runs on the server, so its HTML
 * is in the response on a hard load even though the swap happens before the
 * browser paints and none of it is ever shown. Only per-org queries fix that,
 * and per-org queries are the backend.
 */

type SimulatedPage = {
  title: string;
  icon: LucideIcon;
  /** Mirrors the real page's primary button, shown disabled. */
  action?: string;
  /** Whether the real page shows a count beside its title. */
  counted?: boolean;
  headline: string;
  body: string;
};

/**
 * Keyed by the route's first segment, which is enough: the client's nav is one
 * level deep and nothing in here links to a detail page.
 */
const PAGES: Record<string, SimulatedPage> = {
  inbox: {
    title: "Inbox",
    icon: Inbox,
    headline: "No conversations yet",
    body: "The first text or call to this account's number opens a thread here. Nothing has come in, because this account has no number and no messages.",
  },
  contacts: {
    title: "Contacts",
    icon: Users,
    action: "Add contact",
    counted: true,
    headline: "No contacts yet",
    body: "Contacts create themselves when someone texts, calls or fills in the booking form. A brand-new account starts with none of them.",
  },
  pipeline: {
    title: "Pipeline",
    icon: KanbanSquare,
    headline: "Nothing in the pipeline",
    body: "Contacts move through the stages as they turn into work. There are no contacts in this account to move.",
  },
  calendar: {
    title: "Calendar",
    icon: CalendarDays,
    headline: "No bookings yet",
    body: "Bookings land here from the client's own booking link, once availability has been set on Settings.",
  },
  invoices: {
    title: "Invoices",
    icon: FileText,
    headline: "No invoices yet",
    body: "An invoice needs business details and at least one package, neither of which this account has filled in.",
  },
  business: {
    title: "My Business",
    icon: Briefcase,
    action: "Save",
    headline: "Nothing set up yet",
    body: "Business name, services and packages. This is usually the first thing a new client fills in, and everything else — invoices, booking, the AI replies — reads from it.",
  },
  automations: {
    title: "Automations",
    icon: Bot,
    action: "New automation",
    counted: true,
    headline: "No automations yet",
    body: "A fresh account gets the default set — the booking confirmation and the hand-off notice — as soon as there is a real account to seed them into.",
  },
  phone: {
    title: "Phone System",
    icon: PhoneCall,
    action: "Buy a number",
    headline: "No phone number yet",
    body: "The client buys their own number here and it becomes the one their customers text and call. This account hasn't bought one.",
  },
  email: {
    title: "Email Services",
    icon: AtSign,
    action: "Add domain",
    headline: "No sending domain yet",
    body: "Until a domain is verified, this account can't send email from its own address.",
  },
  domains: {
    title: "Domains",
    icon: Globe,
    counted: true,
    headline: "No domains yet",
    body: "Domains registered by this client would be listed here, under their own name.",
  },
  settings: {
    title: "Settings",
    icon: Settings,
    action: "Save",
    headline: "Defaults, untouched",
    body: "Availability, the booking link, reminders and the AI's tone. A new account carries the defaults until the client changes them.",
  },
};

/**
 * For a route the client's nav doesn't have — Usage and Sub Accounts, which
 * are hidden from the sidebar in client view but still reachable by typing the
 * URL. Not a permission error, because nothing is being enforced: it says what
 * it is, which is a page that belongs to the admin view.
 */
const OUT_OF_SCOPE: SimulatedPage = {
  title: "Not part of this account",
  icon: Lock,
  headline: "An admin page",
  body: "Usage and Sub Accounts belong to the platform view, not to a client's account. In the real thing a client's role wouldn't reach this page at all; here the nav simply doesn't offer it.",
};

export function SimulatedAccount() {
  const pathname = usePathname();
  const { org } = useOrgContext();

  const segment = pathname.split("/")[1] ?? "";
  const page = PAGES[segment] ?? OUT_OF_SCOPE;
  const Icon = page.icon;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Same chrome as the real pages — h-14, bordered, title at the left —
          so stepping into a client account doesn't feel like a different app. */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            {page.title}
          </h1>
          {page.counted && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              0
            </span>
          )}
        </div>

        {page.action && (
          // Disabled rather than wired to a toast: the point of the empty
          // account is that there is nothing behind any of it.
          <Button size="sm" disabled className="shrink-0">
            {page.action}
          </Button>
        )}
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-4 pb-4">
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-14 text-center">
            <span className="bg-muted text-muted-foreground mb-1 flex size-10 items-center justify-center rounded-full">
              <Icon className="size-5" />
            </span>
            <p className="text-sm font-medium">{page.headline}</p>
            <p className="text-muted-foreground max-w-md text-sm">{page.body}</p>
          </div>

          <p className="text-muted-foreground text-center text-xs">
            Simulated empty account
            {org ? ` for ${org.name}` : ""}. Nothing on this page is connected
            to anything, and no data was loaded to draw it.
          </p>
        </div>
      </div>
    </div>
  );
}
