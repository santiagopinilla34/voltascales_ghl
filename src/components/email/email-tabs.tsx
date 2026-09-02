"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The row of tabs under the Email heading.
 *
 * Routes rather than a `<Tabs>` widget, for the same reasons set out in
 * `agent-tabs.tsx`: each panel has its own data and its own server round trips
 * — Email Services reads the whole domain list live from Resend on every
 * request, which Reply & Forward Settings has no use for — and a client-side
 * tab would make one page pay for both.
 *
 * Two tabs is not many, and the row will look sparse next to the product this
 * borrows its shape from. That is the point: the others on that screen are
 * analytics and deliverability panels this app has no data for, and a tab that
 * opens onto invented numbers is worse than a tab that is not there.
 */

const TABS: { segment: string | null; href: string; label: string }[] = [
  { segment: null, href: "/email", label: "Email services" },
  {
    segment: "reply-forward",
    href: "/email/reply-forward",
    label: "Reply & Forward Settings",
  },
];

export function EmailTabs() {
  const segment = useSelectedLayoutSegment();

  return (
    // Scrolls sideways on a narrow screen instead of wrapping onto a second
    // line, which the h-14 header has no room for. `-mx-*` lets the row bleed
    // into the header's padding so the last tab does not look cut off mid-word
    // when it overflows.
    <nav
      aria-label="Email sections"
      className="-mx-4 flex h-full min-w-0 flex-1 items-stretch gap-4 overflow-x-auto px-4 sm:mx-0 sm:gap-5 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((tab) => {
        const active = segment === tab.segment;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // The indicator is a bottom border on the link itself rather
              // than a floating bar, so it can never drift out of line with
              // the label it belongs to.
              "flex shrink-0 items-center border-b-2 text-sm whitespace-nowrap transition-colors",
              active
                ? "border-foreground text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
