import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * What the thread pane shows while a conversation is being fetched.
 *
 * ## Why this file exists
 *
 * Opening a conversation waits on three round trips — the contact, its
 * messages, and the latest AI draft. Without a Suspense boundary the router
 * holds the *old* screen in place until all three land, so clicking a name in
 * the list did nothing for a moment and the window appeared to freeze. Nothing
 * was broken; there was simply no way to tell the difference between "loading"
 * and "not responding".
 *
 * `loading.tsx` is the boundary. Next swaps this in the instant you click, and
 * the conversation list — which lives in the layout, not here — stays
 * interactive and scrollable throughout. Navigation also becomes
 * interruptible: picking a different conversation halfway through no longer
 * waits for the first one to arrive.
 *
 * ## Why a blurred skeleton rather than a bare spinner
 *
 * A spinner alone on an empty pane makes the app look like it lost the thread.
 * Ghosted bubbles in roughly the shape of a conversation say *what* is coming,
 * hold the layout still so nothing jumps when the real messages replace them,
 * and the blur keeps them clearly unreadable — nobody should squint at a
 * placeholder wondering whether it is a real message.
 */

/**
 * Deliberately irregular. Bubbles of identical width read as a loading bar
 * rather than as a conversation, and the whole point is to suggest the shape
 * of what is arriving.
 */
const BUBBLES = [
  { fromThem: true, width: "w-44" },
  { fromThem: true, width: "w-28" },
  { fromThem: false, width: "w-52" },
  { fromThem: true, width: "w-36" },
  { fromThem: false, width: "w-40" },
  { fromThem: false, width: "w-24" },
];

/** Spacing between each bubble's pulse. Enough to read as a wave down the
 *  thread rather than as one block flashing on and off together. */
const PULSE_STAGGER_MS = 90;

export default function ThreadLoading() {
  return (
    <div className="loading-enter flex min-h-0 flex-1 flex-col">
      {/* Same height and border as the real header, so the pane doesn't
          shift by a pixel when the conversation arrives. */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3 md:px-4">
        <Skeleton className="size-8 shrink-0 rounded-md md:hidden" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-40 max-w-[60%]" />
          <Skeleton className="h-3 w-24 max-w-[35%]" />
        </div>
        <Skeleton className="h-7 w-24 shrink-0 rounded-full" />
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          aria-hidden
          className="flex h-full flex-col justify-end gap-3 overflow-hidden p-4 opacity-70 blur-[3px]"
        >
          {BUBBLES.map((bubble, index) => (
            <div
              key={index}
              className={bubble.fromThem ? "flex" : "flex justify-end"}
            >
              <Skeleton
                className={`h-9 rounded-2xl ${bubble.width} max-w-[75%]`}
                style={{ animationDelay: `${index * PULSE_STAGGER_MS}ms` }}
              />
            </div>
          ))}
        </div>

        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="bg-card/85 text-muted-foreground flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm backdrop-blur-sm">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Loading conversation…
          </span>
        </div>
      </div>

      {/* The reply box holds its place too — it is the tallest thing at the
          bottom, and letting it appear late would push the thread up just as
          somebody starts reading it. */}
      <div className="shrink-0 border-t p-3">
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}
