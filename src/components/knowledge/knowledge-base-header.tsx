"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";

import { KnowledgeBaseDialog } from "@/components/knowledge/knowledge-base-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KNOWLEDGE_SOURCE_KINDS } from "@/lib/knowledge/bases";
import { cn } from "@/lib/utils";
import type { KnowledgeBase } from "@/types/database";

/**
 * The top of one knowledge base: where you came from, what it is called, which
 * half of the base you are looking at, and the row of source tabs.
 *
 * A client component because of the three things on it that are not text — the
 * pencil, which opens the same dialog the list uses, and the two rows of links,
 * which have to know which child route is on screen. Everything else on the
 * screen stays a server component underneath it.
 *
 * ## Two rows, and why they are not one
 *
 * The segmented control is a different kind of choice from the tabs under it.
 * Sources and gaps are the two halves of a knowledge base — what it knows, and
 * what it was asked and could not answer — and the source tabs subdivide the
 * first of those. Flattening them into one row of five would put "FAQ" beside
 * "Knowledge gaps" as if they were the same sort of thing, and would leave the
 * tabs pointing at nothing while gaps is open. So the tab row belongs to the
 * sources half and is hidden with it.
 *
 * The tabs are routes for the reason the AI Agents tabs are routes: a crawler
 * with a queue of URLs and a list of question-and-answer pairs have nothing in
 * common to share state over, and as routes each loads only itself and the
 * back button behaves.
 *
 * `useSelectedLayoutSegment` returns null on the index route, which is All —
 * hence the null in the list rather than a string.
 */

const GAPS_SEGMENT = "gaps";

const TABS: { segment: string | null; label: string }[] = [
  { segment: null, label: "All" },
  ...KNOWLEDGE_SOURCE_KINDS.map((kind) => ({
    segment: kind.segment,
    label: kind.label,
  })),
];

export function KnowledgeBaseHeader({
  base,
  existing,
}: {
  base: KnowledgeBase;
  /** Every base on the account, so the rename can spot a taken name. */
  existing: KnowledgeBase[];
}) {
  const segment = useSelectedLayoutSegment();
  const [editing, setEditing] = useState(false);

  const onGaps = segment === GAPS_SEGMENT;
  const root = `/ai-agents/knowledge-base/${base.id}`;

  // Hard-coded until an unanswered question is a row somewhere. Shown at zero
  // rather than hidden: the number is the point of the tab, and a badge that
  // appears only once there is bad news is a badge nobody learns to read.
  const gapCount = 0;

  return (
    <>
      <div className="flex flex-col gap-3 border-b pb-2">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2 pt-4">
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="mt-0.5 shrink-0"
          >
            <Link
              href="/ai-agents/knowledge-base"
              aria-label="Back to knowledge bases"
            >
              <ArrowLeft />
            </Link>
          </Button>

          {/* `basis-64` rather than a bare `flex-1`: the title keeps the row to
              itself until there is genuinely no room, and then the control
              below drops onto its own line instead of both being crushed. */}
          <div className="min-w-0 flex-1 basis-64">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-semibold tracking-tight">
                Knowledge base — {base.name}
              </h2>

              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={`Edit ${base.name}`}
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>

            {base.description && (
              <p className="text-muted-foreground truncate text-xs">
                {base.description}
              </p>
            )}
          </div>

          <nav
            aria-label="Knowledge base view"
            className="bg-muted text-muted-foreground inline-flex h-8 shrink-0 items-center gap-1 rounded-lg p-0.5"
          >
            <ViewLink href={root} active={!onGaps}>
              Knowledge sources
            </ViewLink>

            <ViewLink href={`${root}/${GAPS_SEGMENT}`} active={onGaps}>
              Knowledge gaps
              <Badge
                variant={onGaps ? "secondary" : "ghost"}
                className="tabular-nums"
              >
                {gapCount}
              </Badge>
            </ViewLink>
          </nav>
        </div>

        {/* Belongs to the sources half, so it goes when gaps is open. */}
        {!onGaps && (
          // Same sideways-scroll treatment as the AI Agents tabs above it: on a
          // phone the row runs out of width before it runs out of tabs, and
          // wrapping onto a second line pushes the content down a whole row.
          <nav
            aria-label="Knowledge sources"
            className="-mx-1 flex min-w-0 items-stretch gap-4 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((tab) => {
              const active = segment === tab.segment;
              const href = tab.segment ? `${root}/${tab.segment}` : root;

              return (
                <Link
                  key={tab.label}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // The indicator is a bottom border on the link itself
                    // rather than a floating bar, so it can never drift out of
                    // line with the label it belongs to.
                    "flex shrink-0 items-center border-b-2 pb-1.5 text-sm whitespace-nowrap transition-colors",
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
        )}
      </div>

      {/* Mounted only while open, so it starts from the base's current name
          rather than from whatever it held last time. */}
      {editing && (
        <KnowledgeBaseDialog
          open
          onOpenChange={(next) => !next && setEditing(false)}
          existing={existing}
          base={base}
        />
      )}
    </>
  );
}

/** One half of the segmented control. Borrows the look of `TabsTrigger`. */
function ViewLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-background text-foreground shadow-sm"
          : "hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
