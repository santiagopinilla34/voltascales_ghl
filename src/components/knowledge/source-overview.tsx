import Link from "next/link";
import { Globe, MessageCircleQuestion, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { KNOWLEDGE_SOURCE_KINDS } from "@/lib/knowledge/bases";

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
