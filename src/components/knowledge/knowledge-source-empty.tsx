import Link from "next/link";
import { Globe, MessageCircleQuestion } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { KNOWLEDGE_SOURCE_KINDS } from "@/lib/knowledge/bases";

/**
 * What a base with nothing in it shows — on the All tab and on each source's
 * own tab.
 *
 * The source screens exist as routes before they do anything, so the tab row
 * is the real shape of a knowledge base from the first day rather than one tab
 * that grows neighbours later. That leaves screens with nothing on them, and
 * the honest thing to put there is a note saying what the source is for and
 * that it is not wired up yet.
 *
 * The icons live here rather than in `bases.ts` because that module is shared
 * with the server and a Lucide component in it would drag the icon set into
 * places that only wanted a string.
 */

const ICONS: Record<string, LucideIcon> = {
  "web-crawler": Globe,
  faq: MessageCircleQuestion,
};

/** The All tab: nothing added yet, and the ways to add something. */
export function NoSourcesYet({ baseId }: { baseId: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-16 text-center">
      <p className="text-sm font-medium">No knowledge sources added</p>

      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        Start by adding content from your website or from the questions you
        already answer. Until there is something in here, an agent pointed at
        this base has nothing to go on but the wording of its prompt.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        {KNOWLEDGE_SOURCE_KINDS.map((kind) => {
          const Icon = ICONS[kind.segment];

          return (
            <Button key={kind.segment} asChild variant="outline" size="sm">
              <Link href={`/ai-agents/knowledge-base/${baseId}/${kind.segment}`}>
                {Icon && <Icon className="size-3.5" />}
                {kind.label}
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/** One source's own tab, before that source does anything. */
export function SourceNotBuiltYet({ segment }: { segment: string }) {
  const kind = KNOWLEDGE_SOURCE_KINDS.find((item) => item.segment === segment);
  const Icon = ICONS[segment];

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-16 text-center">
      <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
        {Icon && <Icon className="size-4" />}
      </span>

      <p className="text-sm font-medium">
        {kind?.label} isn&apos;t built yet
      </p>

      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        {kind?.blurb}
      </p>
    </div>
  );
}
