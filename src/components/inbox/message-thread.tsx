"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Bot, Cog, User } from "lucide-react";

import type { Message, MessageSender, MessageStatus } from "@/types/database";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  dayKeyOf,
  formatDayDivider,
  formatFullTimestamp,
  formatMessageTime,
} from "@/lib/format";

import { DeliveryReceipt } from "./delivery-receipt";
import { usePendingMessages } from "./pending-messages";
import { ARRIVE_SPRING, EASE_OUT } from "./motion";

/** How each sender is labelled and iconified on an outbound bubble. */
const SENDER = {
  human: { label: "Sent by you", Icon: User },
  ai: { label: "Sent by AI", Icon: Bot },
  system: { label: "Sent by an automation", Icon: Cog },
} as const;

type SentBy = keyof typeof SENDER;

function senderOf(sentBy: MessageSender) {
  return SENDER[sentBy as SentBy] ?? SENDER.system;
}

/**
 * One row of the thread, from either source.
 *
 * The server's messages and the composer's not-yet-saved ones are flattened
 * into this before anything is drawn, so the rendering below never asks which
 * kind it is holding. The alternative — branching on the type inside the map —
 * meant every visual decision in this file existed twice and the optimistic
 * bubble drifted a pixel at a time away from the real one it becomes.
 */
type Row = {
  key: string;
  body: string | null;
  createdAt: string;
  outbound: boolean;
  sentBy: MessageSender;
  status: MessageStatus | null;
};

function rowOf(message: Message): Row {
  return {
    key: message.id,
    body: message.body,
    createdAt: message.created_at,
    outbound: message.direction === "out",
    sentBy: message.sent_by,
    status: message.status,
  };
}

/**
 * How many messages at the end of the thread stagger in when it opens, and how
 * far apart they are.
 *
 * The cap is the point. Staggering every message meant a thread with two
 * hundred in it spent six seconds animating rows nobody was looking at — the
 * thread opens scrolled to the bottom, so everything above this window is
 * off-screen and should simply be there already. Ten at 30ms is a wave you can
 * follow down the visible messages and is over in under a third of a second.
 */
const OPEN_STAGGER_COUNT = 10;
const OPEN_STAGGER_STEP = 0.03;

export function MessageThread({ messages }: { messages: Message[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { pending, reconcile } = usePendingMessages();

  // Retire the optimistic bubbles whose real rows have arrived.
  //
  // In an effect rather than during render because it sets state in another
  // component, and after paint rather than before it because the two must swap
  // in the same frame — dropping the pending bubble in the render *before* the
  // server row is on screen is a visible blink at the bottom of the thread,
  // which is the one place the reader is looking.
  useEffect(() => {
    reconcile(new Set(messages.map((message) => message.id)));
  }, [messages, reconcile]);

  // Anything already reconciled is gone from `pending`; anything left is either
  // still in flight or waiting for its row. Appended rather than merged by
  // timestamp: these are the newest thing in the thread by definition, and
  // sorting by a clock the client set against timestamps the database set is a
  // way to have a message you just sent appear above one from a minute ago.
  const rows: Row[] = [
    ...messages.map(rowOf),
    ...pending.map((message) => ({
      key: message.id,
      body: message.body,
      createdAt: message.createdAt,
      outbound: true,
      sentBy: "human" as MessageSender,
      status: null,
    })),
  ];

  // Which messages were already here when this thread was opened. Everything
  // else arrived while somebody was watching, and the two want different
  // motion: the ones that were already here are the conversation being
  // *displayed*, and the ones after are the conversation *happening*.
  //
  // A set of ids rather than a "have we mounted yet" flag, because this
  // component does not remount when a message arrives. `router.refresh()`
  // re-renders the server tree in place (see `realtime-refresh.tsx`), so a text
  // landing is a longer `messages` array on the same instance — which is
  // exactly what makes the distinction cheap to draw here.
  //
  // Held in state with a lazy initialiser rather than in a ref. It is read
  // while rendering — which of these two animations a bubble gets is part of
  // what this component draws — and a ref read during render is the thing
  // `react-hooks/refs` exists to stop. State computed once at mount says the
  // same thing and is legal to read.
  const [opened] = useState(
    () => new Set(messages.map((message) => message.id)),
  );

  // Jump to the newest message on open and after each send. `instant` on first
  // paint so the thread doesn't visibly scroll itself on arrival.
  //
  // Scrolls this container directly rather than calling `scrollIntoView` on a
  // sentinel at the bottom. `scrollIntoView` adjusts *every* scrollable
  // ancestor, and an `overflow-hidden` ancestor still scrolls programmatically
  // — so it dragged the app shell up and clipped the thread header off the top
  // of the screen, where nothing could scroll it back. Setting `scrollTop` here
  // cannot move anything but this element.
  //
  // The bubbles arrive on a transform, which does not affect layout, so
  // `scrollHeight` is already its final value when this runs — the scroll and
  // the entrance play together instead of one chasing the other.
  const firstRender = useRef(true);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: firstRender.current ? "instant" : "smooth",
    });
    firstRender.current = false;
    // `rows`, not `messages`: an optimistic bubble is the reason the thread got
    // longer as often as a server row is now, and the send that produced it is
    // the moment the reader most expects the view to follow them down.
  }, [rows.length]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">
          No messages yet. Anything you send starts the conversation.
        </p>
      </div>
    );
  }

  // Derived up front rather than tracked in a variable across the map: React
  // renders may be interrupted and replayed, so a running accumulator can go
  // out of step with the rows it is describing.
  const startsNewDay = rows.map(
    (row, index) =>
      index === 0 ||
      dayKeyOf(row.createdAt) !== dayKeyOf(rows[index - 1].createdAt),
  );

  const staggerFrom = Math.max(0, rows.length - OPEN_STAGGER_COUNT);

  // The one message that carries a receipt: the last one that went out.
  //
  // Searched from the end rather than tracked while mapping, because "the last
  // outbound row" is a fact about the whole list and a row cannot know it by
  // looking at itself. -1 when the contact has written and nobody has answered,
  // which renders no receipt anywhere — correct, since there is nothing of ours
  // in the thread whose delivery is in question.
  const receiptIndex = rows.findLastIndex((row) => row.outbound);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-5 py-5"
    >
      {/* Full width, not a centred 672px column. The cap belongs on the
          bubble, not on the thread: capping the column left 280px of dead
          margin on each side of a 1234px pane, and pulled both edges inward
          so nothing was anchored — inbound floated well right of the left
          edge and outbound well left of the right one, which is what made the
          conversation look squeezed into the middle of its own pane.

          gap-4 between messages, gap-2 between a bubble and its own stamp
          below. At a uniform gap-1 the stamp under one message sat as close
          to the next message as to the bubble it belonged to, so a thread read
          as a single column of alternating fragments rather than as a series
          of messages each carrying its time. */}
      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const outbound = row.outbound;
          const { label, Icon } = senderOf(row.sentBy);
          const wasThere = opened.has(row.key);

          // A message you watched arrive gets a spring and 10px of travel; one
          // that was already in the thread when you opened it gets a shorter,
          // flatter version of the same move on a stagger. Same direction and
          // same origin either way — what changes is how much it insists.
          //
          // The origin is the corner the message came from. Scaling a
          // full-width row about its centre pulled outbound bubbles left, away
          // from the edge they are anchored to, so a reply appeared to arrive
          // from the middle of the pane rather than from the box it was typed
          // in. A full `transform` string rather than the `x`/`scale` shorthand
          // props, which are not hardware-accelerated and drop frames while the
          // page is busy — which, on a route that re-renders on every inbound
          // message, it frequently is.
          const enter = reduce
            ? { opacity: 0 }
            : wasThere
              ? { opacity: 0, transform: "translateY(6px) scale(1)" }
              : { opacity: 0, transform: "translateY(10px) scale(0.96)" };

          const settle = reduce
            ? { opacity: 1 }
            : { opacity: 1, transform: "translateY(0px) scale(1)" };

          return (
            <motion.div
              key={row.key}
              initial={enter}
              animate={settle}
              transition={
                reduce
                  ? { duration: 0.12 }
                  : wasThere
                    ? {
                        duration: 0.26,
                        ease: EASE_OUT,
                        delay:
                          index >= staggerFrom
                            ? (index - staggerFrom) * OPEN_STAGGER_STEP
                            : 0,
                      }
                    : ARRIVE_SPRING
              }
              style={{
                transformOrigin: outbound ? "bottom right" : "bottom left",
              }}
            >
              {startsNewDay[index] && (
                <div className="flex items-center gap-3 py-3">
                  <span className="bg-border h-px flex-1" />
                  <span className="text-muted-foreground text-[11px] font-medium">
                    {formatDayDivider(row.createdAt)}
                  </span>
                  <span className="bg-border h-px flex-1" />
                </div>
              )}

              <div
                className={cn(
                  "flex flex-col gap-2",
                  outbound ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    // 10px, and the same on all four corners. `rounded-2xl`
                    // came out at 18px on a 28px-tall bubble, which is most of
                    // the way to a pill — a one-line message read as a chip
                    // rather than as a message. The clipped corner that used
                    // to point at the sender goes with it: the side of the
                    // column already says who sent it, and the notch was the
                    // only thing making the two edges of a bubble unequal.
                    // The readable measure moved here from the column. 80% of
                    // the pane keeps a short message looking like a message
                    // rather than a banner, and the 42rem ceiling stops a long
                    // one running to a 110-character line on a wide monitor.
                    "max-w-[min(80%,42rem)] rounded-[10px] px-4 py-2 text-sm break-words whitespace-pre-wrap",
                    // Green, not `bg-primary`. In the dark theme `--primary`
                    // is a near-white grey, so your own messages came out the
                    // same value as theirs and the only thing telling the two
                    // sides apart was which edge they sat against. The green
                    // is the brand's, and the same one the send button uses.
                    outbound ? "bg-emerald-600 text-white" : "bg-muted",
                  )}
                >
                  {row.body?.trim() || (
                    <span className="italic opacity-70">(empty message)</span>
                  )}
                </div>

                <div className="text-muted-foreground flex items-center gap-1 px-1 text-[11px]">
                  {/* Only the senders that are not you.

                      "You" was on every message you had ever sent, saying what
                      the side of the thread and the colour of the bubble had
                      already said. The label earns its place when the answer is
                      surprising — the agent replied, or an automation did —
                      and a thread where the only badges are those is one you
                      can scan for them. Inbound needs none either: that is
                      always the contact. */}
                  {outbound && row.sentBy !== "human" && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1">
                            <Icon className="size-3" aria-hidden />
                            <span className="sr-only">{label}</span>
                            <span aria-hidden>
                              {row.sentBy === "ai" ? "AI" : "Automation"}
                            </span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{label}</TooltipContent>
                      </Tooltip>
                      <span aria-hidden>·</span>
                    </>
                  )}

                  {/* Kept for screen readers, which have none of what makes
                      this obvious on screen — no side, no colour. Without it a
                      message you sent and one you received would read as the
                      same thing: a body and a time. */}
                  {outbound && row.sentBy === "human" && (
                    <span className="sr-only">{label}</span>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <time dateTime={row.createdAt} className="tabular-nums">
                        {formatMessageTime(row.createdAt)}
                      </time>
                    </TooltipTrigger>
                    <TooltipContent>
                      {formatFullTimestamp(row.createdAt)}
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* On its own line under the stamp rather than appended to it.
                    Folded into "You · 3:42 PM · Delivered" the receipt reads as
                    a third piece of metadata and the fade draws the eye to the
                    middle of a sentence; on its own line it is what it is — a
                    note about this message, under this message.

                    Only ever on one row in the thread. See `receiptIndex`. */}
                {index === receiptIndex && (
                  <DeliveryReceipt status={row.status} />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
