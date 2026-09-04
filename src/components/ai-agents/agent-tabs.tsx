"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The row of tabs under the AI Agents heading.
 *
 * Routes rather than a `<Tabs>` widget, and that is the decision worth
 * recording. Each of these is going to grow into a screen with its own data,
 * its own forms and its own loading state — a voice agent's numbers and
 * prompts have nothing in common with a knowledge base's documents — and
 * hanging four of those off one component's state would mean one page paying
 * for all four every time it opens. As routes they load what they need, they
 * are linkable, and the back button does what it looks like it should.
 *
 * `useSelectedLayoutSegment` reads which child of the AI Agents layout is on
 * screen, so the highlight follows the URL rather than being told. Getting
 * Started is the index route, which has no segment of its own — hence the
 * `null` below rather than a string.
 */

const TABS: { segment: string | null; href: string; label: string }[] = [
  { segment: null, href: "/ai-agents", label: "Getting Started" },
  { segment: "voice", href: "/ai-agents/voice", label: "Voice AI" },
  {
    segment: "conversation",
    href: "/ai-agents/conversation",
    label: "Conversation AI",
  },
  {
    segment: "knowledge-base",
    href: "/ai-agents/knowledge-base",
    label: "Knowledge Base",
  },
];

export function AgentTabs() {
  const segment = useSelectedLayoutSegment();

  return (
    // Scrolls sideways on a narrow screen instead of wrapping onto a second
    // line, which the h-14 header has no room for. `-mx-*` lets the row bleed
    // into the header's padding so the last tab does not look cut off mid-word
    // when it overflows.
    // pt-2 pb-3 rather than the links running the full height of the row: the
    // underline is an indicator, and one welded to the bottom edge of the bar
    // reads as a second border rather than as a mark against a tab.
    <nav
      aria-label="AI Agents sections"
      className="-mx-4 flex h-full min-w-0 flex-1 items-stretch gap-4 overflow-x-auto px-4 pt-2 pb-3 sm:mx-0 sm:gap-5 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              // The indicator is green and the label is not. Colouring both
              // would make the current tab the loudest text in the row, which
              // it does not need to be — it is already the only one underlined
              // and the only one at full contrast. The rule carries the brand;
              // the word stays a word.
              active
                ? "text-foreground border-emerald-500 font-medium dark:border-emerald-400"
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
