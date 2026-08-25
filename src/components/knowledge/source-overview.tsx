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
 * The whole card is the link, and the plus is drawn inside it rather than
 * being its own button. Two controls that go to the same place is a choice
 * nobody wants to make, and a button nested inside a link is invalid markup
 * that keyboard users hit before anybody else does.
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

        return (
          <Link
            key={kind.segment}
            href={`/ai-agents/knowledge-base/${baseId}/${kind.segment}`}
            className="hover:border-primary/40 focus-visible:ring-ring/50 group flex flex-col overflow-hidden rounded-xl border transition-colors focus-visible:ring-3 focus-visible:outline-none"
          >
            <span className="flex items-center gap-3 px-4 py-3">
              <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
                {Icon && <Icon className="size-4" />}
              </span>

              <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                {kind.label}
              </span>

              {/* Decorative: the card around it is the control. Hidden from
                  screen readers so the link is announced once, by its name. */}
              <span
                aria-hidden
                className="text-muted-foreground group-hover:text-primary flex size-7 shrink-0 items-center justify-center transition-colors"
              >
                <Plus className="size-4" />
              </span>
            </span>

            <span className="bg-muted/40 flex flex-col gap-0.5 border-t px-4 py-3">
              <span className="text-muted-foreground text-xs">
                {kind.metric}
              </span>
              <span className="text-sm tabular-nums">
                {count.toLocaleString()}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
