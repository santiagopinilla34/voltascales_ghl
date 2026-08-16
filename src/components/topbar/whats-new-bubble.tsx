"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Megaphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CHANGELOG,
  WHATS_NEW_STORAGE_KEY,
  unreadEntries,
  type ChangelogEntry,
} from "@/lib/whats-new";

/**
 * What changed in the app.
 *
 * The entries are in the repo (`src/lib/whats-new.ts`); only the "you have
 * seen up to here" marker is per-device, and it lives in localStorage. That is
 * the right storage for it — it is a UI preference, not data, and putting it in
 * the database would mean a migration and a round trip to decide whether to
 * draw a dot.
 */

const STORAGE_EVENT = "voltascales:whats-new-changed";

function subscribeToStorage(onChange: () => void) {
  window.addEventListener(STORAGE_EVENT, onChange);
  // Another tab writing the key fires `storage` rather than our own event.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(STORAGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Reads the marker without tripping over server rendering.
 *
 * `useSyncExternalStore` rather than an effect: the server has no
 * localStorage, so its snapshot is null and the client's is the stored value,
 * and React reconciles the difference itself instead of us flashing the dot on
 * and back off.
 */
function useLastSeen(): [string | null, (id: string) => void] {
  const lastSeen = useSyncExternalStore(
    subscribeToStorage,
    () => {
      try {
        return window.localStorage.getItem(WHATS_NEW_STORAGE_KEY);
      } catch {
        // Private mode and embedded webviews can refuse localStorage. A
        // permanently unread bubble is a nuisance, not a bug worth crashing on.
        return null;
      }
    },
    () => null,
  );

  function mark(id: string) {
    try {
      window.localStorage.setItem(WHATS_NEW_STORAGE_KEY, id);
    } catch {
      return;
    }
    // localStorage does not notify the tab that wrote it.
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }

  return [lastSeen, mark];
}

const TAG_TONE: Record<ChangelogEntry["tag"], string> = {
  New: "bg-primary/10 text-primary",
  Improved: "bg-muted text-muted-foreground",
  Fixed: "bg-muted text-muted-foreground",
};

function EntryRow({
  entry,
  unread,
  onNavigate,
}: {
  entry: ChangelogEntry;
  unread: boolean;
  onNavigate: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span
          className={[
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            TAG_TONE[entry.tag],
          ].join(" ")}
        >
          {entry.tag}
        </span>
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {entry.date}
        </span>
        {unread && (
          <span
            className="bg-primary ml-auto size-1.5 shrink-0 rounded-full"
            aria-label="Not seen yet"
          />
        )}
      </div>
      <p className="text-xs font-medium">{entry.title}</p>
      <p className="text-muted-foreground text-xs">{entry.body}</p>
    </>
  );

  if (!entry.href) {
    return (
      <li className="flex flex-col gap-1 px-2 py-2">{body}</li>
    );
  }

  return (
    <li>
      <Link
        href={entry.href}
        onClick={onNavigate}
        className="hover:bg-muted/60 flex flex-col gap-1 rounded-md px-2 py-2 transition-colors"
      >
        {body}
      </Link>
    </li>
  );
}

export function WhatsNewBubble() {
  const [lastSeen, markSeen] = useLastSeen();
  const [open, setOpen] = useState(false);

  const unread = unreadEntries(lastSeen);
  const unreadIds = new Set(unread.map((entry) => entry.id));

  function acknowledge() {
    if (CHANGELOG.length > 0) markSeen(CHANGELOG[0].id);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Marked on close rather than on open, so opening it and reading it are
        // the same gesture and nothing is cleared before it has been seen.
        if (!next) acknowledge();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          className="relative size-10 rounded-full"
          aria-label={
            unread.length > 0 ? "What's new, with updates" : "What's new"
          }
        >
          <Megaphone className="size-5" />
          {unread.length > 0 && (
            <span className="bg-primary absolute top-1 right-1 size-2 rounded-full ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <h2 className="flex-1 text-sm font-medium">What&apos;s new</h2>
          {unread.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {unread.length} new
            </Badge>
          )}
        </div>

        <ul className="flex max-h-96 flex-col overflow-y-auto p-1">
          {CHANGELOG.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              unread={unreadIds.has(entry.id)}
              onNavigate={() => {
                acknowledge();
                setOpen(false);
              }}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
