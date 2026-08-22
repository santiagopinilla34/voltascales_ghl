"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Lock, Search, X } from "lucide-react";

import {
  TRIGGER_CATEGORIES,
  searchCatalogue,
  type CatalogueEntry,
} from "@/components/automations/trigger-catalogue";
import type { TriggerType } from "@/components/automations/editor-shape";
import { PANEL_SHELL } from "@/components/automations/canvas/panel-shell";
import { TRIGGER_META, type TriggerKey } from "@/components/automations/trigger-meta";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The trigger picker, as a panel beside the canvas.
 *
 * Two things it does that a plain dropdown can't. It groups by category, so
 * the shape of what the product can react to is visible at a glance. And it
 * shows the triggers that aren't wired up yet, greyed, each with the specific
 * thing that would have to exist first — which is how you find out that email
 * open tracking is one webhook endpoint away rather than assuming it isn't
 * possible.
 */

function EntryRow({
  entry,
  disabled,
  onPick,
}: {
  entry: CatalogueEntry;
  /** Already on the rule — available, but not twice. */
  disabled: boolean;
  onPick: (type: TriggerType) => void;
}) {
  const unavailable = entry.status === "unavailable";
  const Icon =
    entry.status === "available"
      ? TRIGGER_META[entry.type as TriggerKey]?.Icon
      : undefined;

  return (
    <button
      type="button"
      disabled={unavailable || disabled}
      onClick={() => entry.status === "available" && onPick(entry.type)}
      title={
        unavailable
          ? `Not available: ${entry.blockedBy}`
          : disabled
            ? "Already on this rule"
            : entry.description
      }
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
        unavailable || disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-accent",
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center">
        {unavailable ? (
          <Lock className="text-muted-foreground size-3.5" />
        ) : Icon ? (
          <Icon className="size-4" />
        ) : null}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{entry.label}</span>
        <span className="text-muted-foreground truncate text-[11px]">
          {unavailable ? entry.blockedBy : disabled ? "Already on this rule" : entry.description}
        </span>
      </span>

      {!unavailable && !disabled && (
        <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
      )}
    </button>
  );
}

export function AddTriggerPanel({
  existing,
  onPick,
  onClose,
}: {
  /** Trigger types already on the rule, so they can't be added twice. */
  existing: TriggerType[];
  onPick: (type: TriggerType) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const matches = searchCatalogue(query);

    return TRIGGER_CATEGORIES.map((category) => ({
      category,
      entries: matches.filter((entry) => entry.category === category),
    })).filter((group) => group.entries.length > 0);
  }, [query]);

  return (
    <aside className={PANEL_SHELL}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
          Add trigger
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the trigger picker"
          className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="shrink-0 border-b p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search triggers"
            className="h-8 pl-8 text-xs"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {grouped.length === 0 ? (
          <p className="text-muted-foreground px-2 py-8 text-center text-xs">
            Nothing matches “{query}”.
          </p>
        ) : (
          grouped.map((group) => (
            <section key={group.category} className="mb-3">
              <h3 className="text-muted-foreground px-2 py-1.5 text-[11px] font-medium tracking-wide uppercase">
                {group.category}
              </h3>
              <div className="flex flex-col">
                {group.entries.map((entry) => (
                  <EntryRow
                    key={entry.label}
                    entry={entry}
                    disabled={
                      entry.status === "available" &&
                      existing.includes(entry.type)
                    }
                    onPick={onPick}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Said once, at the bottom, rather than on every greyed row. */}
      <p className="text-muted-foreground shrink-0 border-t px-3 py-2 text-[11px]">
        Greyed triggers aren&apos;t connected yet. Each says what it needs.
      </p>
    </aside>
  );
}
