import Link from "next/link";
import { Globe, MessageCircleQuestion, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { KNOWLEDGE_SOURCE_KINDS } from "@/lib/knowledge/bases";
import { cn } from "@/lib/utils";

/**
 * The All tab: one card per kind of source, each saying how much of it this
 * base holds.
 *
 * A grid of counts rather than a merged list of everything in the base, which
 * is what "All" first sounds like. Thirteen crawled pages interleaved with
 * four questions is a list of things that have nothing to do with each other
 * and no column they share — and the two tabs beside this one already show
 * each kind properly. What the tab is actually for is the question you have on
 * arriving at a base you set up a month ago: what is in here, and is any of it
 * empty. A card per kind answers that in one glance.
 *
 * Cards for every kind, including the ones sitting at zero. A card that
 * appeared only once a source had something in it would hide the fact that the
 * source exists, which is exactly backwards on the screen whose job is to say
 * what a base could be filled with.
 *
 * ## Except when every kind is at zero
 *
 * A grid of nothing but zeroes is a worse answer than a sentence. It reads as
 * a screen that failed to load, it puts the number a new base is least
 * interested in on every card, and it buries the only thing there is to do
 * here — add something — behind a plus small enough to be furniture.
 *
 * So a base with nothing in it gets an empty state instead, and that empty
 * state still names every kind: one button per `KNOWLEDGE_SOURCE_KINDS` entry,
 * pointing at the same `?add=1` the plus does. The rule above is kept — no
 * source is hidden by being empty — while the screen says what it is for in
 * words rather than in a row of noughts.
 *
 * ## The card and the plus are two different destinations
 *
 * The card opens the source; the plus opens that source's add dialog. So they
 * are two links, not one, and they cannot be nested -- a link inside a link is
 * invalid markup that keyboard users meet before anybody else.
 *
 * The card's link is therefore the title, stretched over the whole card with
 * an `after` pseudo-element, and the plus sits above it on the z axis. That is
 * the one arrangement where the whole card is clickable, the plus is
 * separately clickable, and the accessibility tree still contains exactly two
 * links with names worth reading.
 *
 * The plus does not open a dialog from here. It links to the source's tab with
 * `?add=1`, and that tab opens its own dialog on arrival — see
 * `useOpenOnArrival`. Reaching across into another screen's state would mean
 * this component holding a crawler dialog and a FAQ dialog, along with the
 * base's questions for the taken-question check, on a screen whose whole job
 * is to show five numbers.
 *
 * The icons live here rather than in `bases.ts` because that module is shared
 * with the server and a Lucide component in it would drag the icon set into
 * places that only wanted a string.
 */

const ICONS: Record<string, LucideIcon> = {
  "web-crawler": Globe,
  faq: MessageCircleQuestion,
};

export function SourceOverview({
  baseId,
  counts,
}: {
  baseId: string;
  /** How many rows each source holds, keyed by segment. */
  counts: Record<string, number>;
}) {
  const empty = KNOWLEDGE_SOURCE_KINDS.every(
    (kind) => (counts[kind.segment] ?? 0) === 0,
  );

  if (empty) {
    return <NothingAdded baseId={baseId} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {KNOWLEDGE_SOURCE_KINDS.map((kind) => {
        const Icon = ICONS[kind.segment];
        const count = counts[kind.segment] ?? 0;

        const href = `/ai-agents/knowledge-base/${baseId}/${kind.segment}`;

        return (
          <div
            key={kind.segment}
            className="hover:border-primary/40 group relative flex flex-col overflow-hidden rounded-xl border transition-colors focus-within:border-primary/40"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
                {Icon && <Icon className="size-4" />}
              </span>

              <Link
                href={href}
                className="after:absolute after:inset-0 focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded-sm text-sm font-semibold tracking-tight focus-visible:ring-3 focus-visible:outline-none"
              >
                {kind.label}
              </Link>

              <Link
                href={`${href}?add=1`}
                aria-label={`Add to ${kind.label}`}
                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-3 focus-visible:outline-none"
              >
                <Plus className="size-4" />
              </Link>
            </div>

            <div className="bg-muted/40 flex flex-col gap-0.5 border-t px-4 py-3">
              <span className="text-muted-foreground text-xs">
                {kind.metric}
              </span>
              <span className="text-sm tabular-nums">
                {count.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A base with nothing in it yet.
 *
 * The buttons are the source list again, in the same order as the tabs above
 * them, each going to `?add=1` on its own tab. That is the same destination as
 * the plus on a card, so there is one way in to a source's add dialog rather
 * than two that could drift apart.
 */
function NothingAdded({ baseId }: { baseId: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-16 text-center">
      <SourcesIllustration />

      <p className="text-sm font-medium">No knowledge sources added yet</p>

      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        Add content from your website or your own questions and answers. This is
        what the agent is allowed to answer from — until something is in here,
        it has nothing to go on.
      </p>

      <div className="flex flex-wrap justify-center gap-2 pt-1">
        {KNOWLEDGE_SOURCE_KINDS.map((kind) => {
          const Icon = ICONS[kind.segment];

          return (
            <Link
              key={kind.segment}
              href={`/ai-agents/knowledge-base/${baseId}/${kind.segment}?add=1`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {Icon && <Icon className="size-3.5" />}
              {kind.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A grid with a couple of cells filled and speech bubbles at its corners —
 * sources going into a base, and questions coming back out of it.
 *
 * Inline and drawn entirely in `currentColor`, for the reason the crawler's
 * illustration is: an asset would be a second thing to keep in step with the
 * theme, and this one only costs a dozen rectangles.
 */
function SourcesIllustration() {
  return (
    <svg
      viewBox="0 0 160 128"
      className="text-muted-foreground/40 h-24 w-auto"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="36.75"
        y="24.75"
        width="86.5"
        height="78.5"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M36.75 51H123.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M36.75 77H123.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M65 24.75V103.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M95 24.75V103.25" stroke="currentColor" strokeWidth="1.5" />

      <rect x="69" y="55" width="22" height="18" rx="2.5" fill="currentColor" />

      <path
        d="M6 8.5A3.5 3.5 0 0 1 9.5 5h28A3.5 3.5 0 0 1 41 8.5v15a3.5 3.5 0 0 1-3.5 3.5H20l-8 7v-7H9.5A3.5 3.5 0 0 1 6 23.5v-15Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect x="13" y="12" width="21" height="2.5" rx="1.25" fill="currentColor" />
      <rect x="13" y="18" width="13" height="2.5" rx="1.25" fill="currentColor" />

      <path
        d="M119 104.5a3.5 3.5 0 0 1 3.5-3.5h28a3.5 3.5 0 0 1 3.5 3.5v15a3.5 3.5 0 0 1-3.5 3.5h-17.5l-8 7v-7h-2.5a3.5 3.5 0 0 1-3.5-3.5v-15Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="126"
        y="108"
        width="21"
        height="2.5"
        rx="1.25"
        fill="currentColor"
      />
      <rect
        x="126"
        y="114"
        width="13"
        height="2.5"
        rx="1.25"
        fill="currentColor"
      />
    </svg>
  );
}
