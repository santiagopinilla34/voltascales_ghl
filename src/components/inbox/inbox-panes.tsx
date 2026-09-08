"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { Conversation } from "@/lib/conversations";
import { cn } from "@/lib/utils";

import { ConversationList } from "./conversation-list";
import { EASE_OUT, EXIT_MS } from "./motion";

/**
 * Two-pane Inbox layout, and the page heading above them.
 *
 * Wide screens show both panes. Narrow screens show one at a time — the list
 * until a conversation is picked, the thread once one is — which is why this
 * has to be a Client Component: the choice depends on the selected child
 * segment, and the layout itself never re-renders on navigation.
 *
 * The heading lives here rather than in the layout for the same reason: it is
 * the third thing that has to know whether a conversation is open.
 */
export function InboxPanes({
  conversations,
  children,
}: {
  conversations: Conversation[];
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();
  const selected = segment !== null;
  const reduce = useReducedMotion();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* On a phone this sits *inside* the app's 80px bubble strip rather than
          below it: `pl-14` clears the menu button on the left, `pr-44` the
          bubbles on the right, and "Inbox · 5 conversations" fits the 154px
          between them.

          It was `pt-20` — pushed under the strip — which cost 112px on a 766px
          screen, a third of what the conversation had left. Hiding it with a
          thread open looked like the fix and was not: the strip is still there,
          so the panes then needed the same 80px of clearance themselves and
          the thread header ended up underneath the bell. Sharing the row costs
          nothing and keeps the heading.

          No `mx-auto max-w-[1400px]`, unlike every other page: the Inbox is
          full-bleed, and centring the heading in a 1400px column while the
          panes below start at the window edge left the count floating 130px
          right of the list it counts. The gutters match the panes instead. */}
      <header className="shrink-0">
        <div className="flex h-20 w-full min-w-0 items-center pr-44 pl-14 md:px-4">
          {/* The count sits over the list it counts rather than at the far
              right of the window, so this block is the list pane's width. */}
          <div className="flex w-full items-center justify-between gap-3 md:w-80 lg:w-96">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              Inbox
            </h1>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {conversations.length}
              {conversations.length === 1 ? " conversation" : " conversations"}
            </span>
          </div>
        </div>
      </header>

      {/* Two cards with a gutter between them, rather than two regions divided
          by a hairline. The panes hold different things — a list you scan and a
          conversation you read — and giving each an edge of its own says that
          more plainly than a 1px rule ever did. */}
      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3 md:px-4 md:pb-4">
        <div
          className={cn(
            "bg-card/40 h-full shrink-0 overflow-hidden rounded-xl border",
            selected ? "hidden md:block" : "w-full md:w-auto",
          )}
        >
          <ConversationList conversations={conversations} />
        </div>

        {/* `overflow-hidden` is load-bearing, not cosmetic: without it a child
            taller than the pane spills into the app shell, which is `h-dvh
            overflow-hidden` and so clips it with no way to scroll it back. The
            thread inside is the one thing that scrolls.

            `relative` is here for `popLayout` below, which takes the outgoing
            conversation out of the flex flow by positioning it absolutely —
            it needs this box to be what it positions against. */}
        <div
          className={cn(
            "bg-card/40 relative h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border",
            selected ? "flex" : "hidden md:flex",
          )}
        >
          {/* The one thing CSS could not do for this pane: an *exit*.
              `.thread-enter` and `.loading-enter` in `globals.css` still own
              every entrance here — they are argued for where they live, and
              this does not duplicate them. What they could never do is fade
              the conversation you are leaving, because by the time CSS could
              animate it React has already unmounted it. So switching threads
              was a hard cut: the old messages were replaced mid-blink under a
              header that had already changed to somebody else's name.

              `mode="popLayout"` rather than `"wait"`. Waiting would hold the
              pane empty for the length of the exit before the new thread was
              allowed to mount, and a click that produces nothing for 140ms
              reads as a dropped click — the whole reason `loading.tsx` exists.
              popLayout lifts the outgoing thread out of the flow instead, so
              the incoming one starts arriving immediately underneath it and
              the two genuinely cross over.

              Keyed on the segment, not on `children`: the segment is the
              contact id, so re-rendering the same conversation (which
              `router.refresh()` does on every inbound message) is not a
              transition and must not animate. */}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={segment ?? "empty"}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.05 : EXIT_MS, ease: EASE_OUT }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
