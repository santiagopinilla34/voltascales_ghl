"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Bot, Cog, User } from "lucide-react";

import type { Message } from "@/types/database";
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

import { ARRIVE_SPRING, EASE_OUT } from "./motion";

/** How each sender is labelled and iconified on an outbound bubble. */
const SENDER = {
  human: { label: "Sent by you", Icon: User },
  ai: { label: "Sent by AI", Icon: Bot },
  system: { label: "Sent by an automation", Icon: Cog },
} as const;

type SentBy = keyof typeof SENDER;

function senderOf(message: Message) {
  return SENDER[message.sent_by as SentBy] ?? SENDER.system;
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
  }, [messages.length]);

  if (messages.length === 0) {
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
  const startsNewDay = messages.map(
    (message, index) =>
      index === 0 ||
      dayKeyOf(message.created_at) !== dayKeyOf(messages[index - 1].created_at),
  );

  const staggerFrom = Math.max(0, messages.length - OPEN_STAGGER_COUNT);

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
        {messages.map((message, index) => {
          const outbound = message.direction === "out";
          const { label, Icon } = senderOf(message);
          const wasThere = opened.has(message.id);

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
              key={message.id}
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
                    {formatDayDivider(message.created_at)}
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
                  {message.body?.trim() || (
                    <span className="italic opacity-70">(empty message)</span>
                  )}
                </div>

                <div className="text-muted-foreground flex items-center gap-1 px-1 text-[11px]">
                  {/* Only outbound messages have a meaningful sender: inbound
                      is always the contact. */}
                  {outbound && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1">
                          <Icon className="size-3" aria-hidden />
                          <span className="sr-only">{label}</span>
                          <span aria-hidden>
                            {message.sent_by === "human"
                              ? "You"
                              : message.sent_by === "ai"
                                ? "AI"
                                : "Automation"}
                          </span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{label}</TooltipContent>
                    </Tooltip>
                  )}
                  {outbound && <span aria-hidden>·</span>}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <time
                        dateTime={message.created_at}
                        className="tabular-nums"
                      >
                        {formatMessageTime(message.created_at)}
                      </time>
                    </TooltipTrigger>
                    <TooltipContent>
                      {formatFullTimestamp(message.created_at)}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
