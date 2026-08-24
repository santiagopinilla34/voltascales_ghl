"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  CalendarClock,
  Inbox,
  Layers,
  MessageSquareQuote,
  RefreshCw,
  Split,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The strip of advice above the list.
 *
 * A knowledge base is one of those features where the screen is easy and the
 * job is not: nobody is confused by a Create button, and almost everybody's
 * first base is a wall of text that the agent then quotes badly. So the space
 * at the top of the page is spent on what to write rather than on repeating
 * what the page already shows.
 *
 * It rotates because seven of these stacked would be a page of documentation
 * sitting on top of a list of four rows, and because a tip somebody has read
 * is worth less than the next one. It stops rotating the moment anybody
 * touches it — hovering, or picking a dot. Something that keeps moving while
 * you are reading it is worse than something that does not move at all, and a
 * carousel that takes the slide away mid-sentence is the reason people dislike
 * carousels.
 */

type Tip = { icon: LucideIcon; title: string; body: string };

const TIPS: Tip[] = [
  {
    icon: Inbox,
    title: "Start from what you already answer",
    body: "Open your inbox and read the last twenty conversations. Anything you have typed more than once is a fact your agent should know, and it is already written in your own words.",
  },
  {
    icon: Split,
    title: "One base per audience, not per document",
    body: "Everything a stranger may be told goes in one base. Anything internal — margins, escalation rules, what to say about a difficult client — goes in another, so no agent can reach it by accident.",
  },
  {
    icon: MessageSquareQuote,
    title: "Write it the way you say it",
    body: "The agent answers in the register it was trained on. Short sentences, your prices, your names for things. A page of marketing copy makes an agent that sounds like a brochure.",
  },
  {
    icon: CalendarClock,
    title: "Give prices and offers a date",
    body: "Write \"$180 as of March 2026\" rather than \"$180\". An agent has no way of knowing a rate is stale, and a dated one tells you at a glance which article to check first.",
  },
  {
    icon: Ban,
    title: "Say what you don't do",
    body: "The limits matter as much as the services — areas you won't travel to, jobs you turn down, questions that need a human. Without them the agent will try to be helpful, which is how it invents an answer.",
  },
  {
    icon: Layers,
    title: "Point each agent at what it needs",
    body: "A chatbot on a public page and a voice agent on your main line should not read from the same base. Give each one the bases its callers are entitled to, and nothing else.",
  },
  {
    icon: RefreshCw,
    title: "Change it once, everywhere",
    body: "Every agent reads from these, so a price change is one edit rather than a hunt through prompts. Make a habit of it: put the new rate here first, then tell anyone else.",
  },
];

const ROTATE_MS = 8000;

export function KnowledgeTips() {
  const [index, setIndex] = useState(0);
  // Separate flags on purpose. Hovering pauses and un-pauses; picking a dot is
  // a decision to drive, and rotation does not resume after it.
  const [hovering, setHovering] = useState(false);
  const [taken, setTaken] = useState(false);

  useEffect(() => {
    if (taken || hovering) return;

    // Content that changes on its own is exactly what this preference is
    // about, so a reader who has asked for less of it gets a static tip.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setInterval(
      () => setIndex((current) => (current + 1) % TIPS.length),
      ROTATE_MS,
    );

    return () => clearInterval(timer);
  }, [taken, hovering]);

  const tip = TIPS[index];

  return (
    <section
      aria-label="Tips for writing a knowledge base"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={() => setHovering(false)}
      className="bg-muted/40 flex flex-col gap-3 rounded-xl border px-4 py-4 sm:px-5"
    >
      {/* Keyed on the index so the fade runs again on each change. `min-h`
          holds the box still while the text under it changes length —
          otherwise the dots and the list below jump on every rotation. */}
      <div
        key={index}
        className="tip-enter flex min-h-[4.5rem] items-start gap-3.5 sm:min-h-[4rem]"
      >
        <span className="bg-foreground text-background flex size-9 shrink-0 items-center justify-center rounded-lg">
          <tip.icon className="size-4" />
        </span>

        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-medium">{tip.title}</h3>
          <p className="text-muted-foreground max-w-[70ch] text-xs leading-relaxed">
            {tip.body}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5">
        {TIPS.map((item, dot) => {
          const active = dot === index;

          return (
            <button
              key={item.title}
              type="button"
              onClick={() => {
                setIndex(dot);
                setTaken(true);
              }}
              aria-label={`Tip ${dot + 1}: ${item.title}`}
              aria-current={active ? "true" : undefined}
              className={cn(
                "focus-visible:ring-ring/50 h-1.5 rounded-full transition-all focus-visible:ring-2 focus-visible:outline-none",
                // The current one is a bar rather than a bigger dot: it reads
                // as position along a strip, which is what it is.
                active
                  ? "bg-foreground w-5"
                  : "bg-foreground/20 hover:bg-foreground/40 w-1.5",
              )}
            />
          );
        })}
      </div>
    </section>
  );
}
