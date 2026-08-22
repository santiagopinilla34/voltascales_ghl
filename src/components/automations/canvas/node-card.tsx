"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One box on the workflow canvas, and the line that leads to the next.
 *
 * The connector is drawn by the node above rather than sitting between nodes
 * as its own element: a chain built from alternating node/connector siblings
 * needs every insertion point to know its neighbours, and this way each node
 * owns the segment below it and the list stays a plain map over steps.
 */

export function NodeCard({
  title,
  subtitle,
  meta,
  Icon,
  tone = "action",
  selected,
  nodeRef,
  onSelect,
  onRemove,
  removeLabel,
}: {
  title: string;
  subtitle?: string;
  /** The filter line under a trigger, as GHL shows conditions on its cards. */
  meta?: string;
  Icon: LucideIcon;
  tone?: "trigger" | "action";
  selected?: boolean;
  /**
   * Handed the card's own element, so the canvas can measure it.
   *
   * The marquee hit-tests against real boxes rather than against positions it
   * worked out itself, which is what lets the chain stay a plain flow layout
   * instead of becoming a set of coordinates to keep in sync.
   */
  nodeRef?: (element: HTMLElement | null) => void;
  /** The event comes through so shift-click can add to a selection. */
  onSelect?: (event: React.MouseEvent) => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div
      ref={nodeRef}
      data-node
      className={cn(
        "bg-card relative w-[260px] rounded-lg border shadow-sm transition-colors",
        selected
          ? "border-primary ring-primary/20 ring-2"
          : "hover:border-muted-foreground/40",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
      >
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
            tone === "trigger"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
          )}
        >
          <Icon className="size-3.5" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-xs font-medium" title={title}>
            {title}
          </span>
          {subtitle && (
            <span
              className="text-muted-foreground truncate text-[11px]"
              title={subtitle}
            >
              {subtitle}
            </span>
          )}
        </span>
      </button>

      {meta && (
        <p className="text-muted-foreground border-t px-3 py-1.5 text-[11px]">
          {meta}
        </p>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
          className={cn(
            "text-muted-foreground hover:text-destructive absolute -top-2 -right-2 rounded-full border bg-background p-1 transition-opacity",
            // A fingertip is blunter than the 18px this draws at, and the
            // canvas is scaled, so at 69% it draws smaller still. The
            // pseudo-element widens what you can hit without widening what
            // you can see.
            "before:absolute before:-inset-2 before:content-['']",
            // Was hover-only, which on a touch screen means a step can't be
            // deleted at all — the same argument the `+` below already makes
            // for itself. Keyed off `hover: hover` rather than a width
            // breakpoint: a narrow desktop window still has a mouse, and a
            // large tablet still hasn't.
            "[@media(hover:hover)]:opacity-0",
            "[@media(hover:hover)]:group-hover/node:opacity-100",
            "[@media(hover:hover)]:focus-visible:opacity-100",
          )}
        >
          <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
            <path
              d="M1 1l10 10M11 1L1 11"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * The vertical line between two nodes, with the insert button on it.
 *
 * The `+` is always present rather than appearing on hover. On a touch screen
 * there is no hover, and a builder whose only way to add a step in the middle
 * is invisible until you find it is a builder where everything gets appended
 * to the end.
 */
export function Connector({
  onInsert,
  label,
}: {
  onInsert?: () => void;
  label: string;
}) {
  return (
    <div className="relative flex h-10 w-full items-center justify-center">
      {/* The line runs the full height behind the button, so the button reads
          as sitting on the wire rather than breaking it. */}
      <div className="bg-border absolute inset-y-0 left-1/2 w-px -translate-x-1/2" />
      {onInsert && (
        <button
          type="button"
          onClick={onInsert}
          aria-label={label}
          title={label}
          className="bg-background text-muted-foreground hover:border-primary hover:text-primary relative rounded-full border p-0.5 transition-colors"
        >
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path
              d="M6 1v10M1 6h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
