"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Lock, Search, X } from "lucide-react";

import { ACTION_META } from "@/components/automations/action-meta";
import {
  ACTION_CATEGORIES,
  searchActionCatalogue,
  type ActionCatalogueEntry,
} from "@/components/automations/action-catalogue";
import type { EditorAction } from "@/components/automations/editor-shape";
import { PANEL_SHELL } from "@/components/automations/canvas/panel-shell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The step picker, in the same panel shape the triggers use.
 *
 * Grouped and searchable rather than a flat list, for the same reason the
 * trigger picker is: the categories are how somebody finds a step they have
 * never used, and the search box is how they find one they have. The greyed
 * rows each name what they are waiting on — see `action-catalogue.ts`.
 */

function EntryRow({
  entry,
  onPick,
}: {
  entry: ActionCatalogueEntry;
  onPick: (type: EditorAction["type"]) => void;
}) {
  const unavailable = entry.status === "unavailable";
  const Icon =
    entry.status === "available" ? ACTION_META[entry.type]?.Icon : undefined;

  return (
    <button
      type="button"
      disabled={unavailable}
      onClick={() => entry.status === "available" && onPick(entry.type)}
      title={unavailable ? `Not available: ${entry.blockedBy}` : entry.description}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
        unavailable ? "cursor-not-allowed opacity-50" : "hover:bg-accent",
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
          {unavailable ? entry.blockedBy : entry.description}
        </span>
      </span>

      {!unavailable && (
        <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
      )}
    </button>
  );
}

export function AddActionPanel({
  onPick,
  onClose,
}: {
  onPick: (type: EditorAction["type"]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const matches = searchActionCatalogue(query);

    return ACTION_CATEGORIES.map((category) => ({
      category,
      entries: matches.filter((entry) => entry.category === category),
    })).filter((group) => group.entries.length > 0);
  }, [query]);

  return (
    <aside className={PANEL_SHELL}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
          Add step
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the step picker"
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
            placeholder="Search steps"
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
                  <EntryRow key={entry.label} entry={entry} onPick={onPick} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <p className="text-muted-foreground shrink-0 border-t px-3 py-2 text-[11px]">
        Steps run top to bottom. There are no branches — a rule does the same
        thing every time it fires.
      </p>
    </aside>
  );
}
