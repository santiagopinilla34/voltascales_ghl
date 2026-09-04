"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Handshake,
  MessageSquare,
  MoonStar,
  type LucideIcon,
} from "lucide-react";

import {
  ConversationPhone,
  KnowledgePhone,
} from "@/components/ai-agents/agent-mockups";
import { cn } from "@/lib/utils";

/**
 * Getting Started: what an AI agent is for, one agent at a time.
 *
 * This is the first thing anybody sees under AI Agents, and for now it is the
 * only thing — the three screens it points at are still empty. So it has one
 * job, which is to answer "what would I use this for" in language about a
 * business rather than about software. Every slide is a claim about the
 * business's day: a call that got answered, a lead that got a reply, a fact the
 * agent knew.
 *
 * A carousel rather than three sections down a page because the three are
 * alternatives, not steps. Stacked, the second and third read as things you do
 * after the first; side by side in one frame they read as a choice, which is
 * what they are. The counter and arrows sit top-left where the eye lands after
 * the tabs.
 *
 * The slide is keyed on the index so React remounts it and the arrival
 * animation runs again — the same rise the pages use, because a slide changing
 * with no motion at all looks like a mis-click.
 */

type Slide = {
  key: string;
  eyebrow: string;
  eyebrowIcon: LucideIcon;
  /** Split in two so the second half can be set in italics, as in the design. */
  headline: [string, string];
  body: string;
  ctaLabel: string;
  ctaHref: string;
  mockup: React.ReactNode;
};

/**
 * The voice agent used to open this and does not appear at all at the moment.
 * It is the furthest off of the three, and leading with the thing that is not
 * being built next made the section a promise rather than a place to start.
 * `VoicePhone` is still in the mockups file, ready for the day it returns.
 */
const SLIDES: Slide[] = [
  {
    key: "conversation",
    eyebrow: "AI chatbot",
    eyebrowIcon: MessageSquare,
    headline: ["Reply in seconds,", "not tomorrow morning"],
    body: "Most leads go to whoever answers first, and most of them are asking the same handful of questions. Your chatbot picks up every message the moment it lands — what you charge, what you do, whether you cover their area — sorts out who is worth your time, and books the ones who are straight into your calendar. The moment you start typing, it steps out of the way.",
    ctaLabel: "Set up Conversation AI",
    ctaHref: "/ai-agents/conversation",
    mockup: <ConversationPhone />,
  },
  {
    key: "knowledge-base",
    eyebrow: "Knowledge base",
    eyebrowIcon: BookOpen,
    headline: ["Trained on your business,", "not on the internet"],
    body: "A chatbot is only as good as what it knows. This is where you put your prices, your hours, your services and the answers you would give yourself — and every agent you run reads from it. Put your rates up once here and the chatbot quotes the new ones from the very next message.",
    ctaLabel: "Build the knowledge base",
    ctaHref: "/ai-agents/knowledge-base",
    mockup: <KnowledgePhone />,
  },
];

/** The three things all of the above amount to, in the owner's own terms. */
const PROMISES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MoonStar,
    title: "Nothing waits until Monday",
    body: "The message at 9pm and the one on Saturday get the same answer as the ones at eleven on a Tuesday.",
  },
  {
    icon: CalendarCheck,
    title: "It books, it doesn't just chat",
    body: "When a conversation reaches a time that works, the agent puts it in your calendar and adds the contact itself.",
  },
  {
    icon: Handshake,
    title: "It knows when to fetch you",
    body: "Anything it is unsure of — or anyone who asks for a person — lands in your inbox with the whole conversation attached.",
  },
];

export function GettingStarted() {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];

  // Wraps in both directions. Three slides is few enough that a disabled arrow
  // at either end is just a dead control most of the time.
  const step = (by: number) =>
    setIndex((current) => (current + by + SLIDES.length) % SLIDES.length);

  return (
    <div className="relative isolate">
      <Backdrop />

      <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col px-4 py-5 sm:px-6 lg:px-10">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs tabular-nums">
            {index + 1}/{SLIDES.length}
          </span>
          <ArrowButton label="Previous agent" onClick={() => step(-1)}>
            <ChevronLeft className="size-4" />
          </ArrowButton>
          <ArrowButton label="Next agent" onClick={() => step(1)}>
            <ChevronRight className="size-4" />
          </ArrowButton>
        </div>

        <div
          key={slide.key}
          // Less air above and below than there was: the phone grew about a
          // hundred and thirty pixels taller when it was given real
          // proportions, and the padding that framed the short one nicely was
          // pushing the promises row off a laptop screen entirely.
          className="page-enter grid flex-1 items-center gap-10 py-8 lg:grid-cols-2 lg:gap-12 lg:py-12"
        >
          <div className="flex min-w-0 flex-col items-start">
            {/* The only coloured text on the screen, and it names the thing the
                phone beside it is demonstrating. Green here rather than on the
                headline because an eyebrow is a label — it can afford to be
                loud at eleven pixels in a way a forty-four pixel headline
                cannot. */}
            <span className="flex items-center gap-2 text-[0.6875rem] font-medium tracking-[0.14em] text-emerald-600 uppercase dark:text-emerald-400">
              <slide.eyebrowIcon className="size-3.5" />
              {slide.eyebrow}
            </span>

            <h2 className="mt-5 text-3xl leading-[1.12] font-semibold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]">
              {slide.headline[0]}
              <br />
              {/* The design leans on a change of voice for the second line
                  rather than a second colour. One typeface, two moods. */}
              <span className="text-muted-foreground font-normal italic">
                {slide.headline[1]}
              </span>
            </h2>

            {/* Capped well short of the column: this is a paragraph, and a
                paragraph stops being readable long before this container runs
                out of room. */}
            <p className="text-muted-foreground mt-5 max-w-[34rem] text-sm leading-relaxed">
              {slide.body}
            </p>

            <Link
              href={slide.ctaHref}
              className="hover:text-foreground/70 focus-visible:ring-ring/50 mt-7 inline-flex items-center gap-1.5 border-b border-current pb-0.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              {slide.ctaLabel}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>

          <div className="flex justify-center lg:justify-end">
            {slide.mockup}
          </div>
        </div>

        {/* Under the fold on a laptop, and deliberately so — the slide above
            makes the case, this is for whoever wants it in three lines.

            Boxed rather than left as three bare columns: the slide above is one
            argument that happens to span the width, and without an edge around
            them these three read as its last paragraph rather than as three
            separate claims. The icon sits on the title's line so each card
            opens with a sentence instead of with a decoration. */}
        <div className="grid gap-5 border-t pt-8 pb-8 sm:grid-cols-3">
          {PROMISES.map((promise) => (
            <div
              key={promise.title}
              className="bg-card/40 flex min-w-0 flex-col gap-3 rounded-xl border p-7"
            >
              <div className="flex min-w-0 items-center gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <promise.icon className="size-[1.125rem]" />
                </span>
                <h3 className="min-w-0 text-[0.9375rem] font-semibold">
                  {promise.title}
                </h3>
              </div>
              <p className="text-muted-foreground text-[0.8125rem] leading-relaxed">
                {promise.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Where the sparks sit, as percentages of the backdrop. */
const SPARKS = [
  { left: "34%", top: "16%", size: 5 },
  { left: "58%", top: "23%", size: 4 },
  { left: "5%", top: "72%", size: 6 },
];

/**
 * The curves, in the backdrop's 1400x900 space.
 *
 * Seven rather than three, and unevenly spaced: two loose ones across the top
 * third, then a tighter bundle low and left. Evenly spread they read as a
 * pattern — wallpaper — and a pattern is a thing you look at. Bunched, with
 * gaps between the bunches, they read as one surface catching light at an
 * angle, which is a thing you look past. The two in each bundle that run
 * closest together are the ones that sell it; a lone curve just looks like a
 * stray stroke.
 */
const CURVES = [
  "M-80 205 C 260 140 480 250 780 190 S 1250 60 1480 130",
  "M-80 268 C 240 214 500 322 800 252 S 1260 128 1480 196",
  "M-80 430 C 300 372 540 470 860 398 S 1290 288 1480 350",
  "M-80 640 C 240 578 470 700 780 606 S 1230 470 1480 545",
  "M-80 676 C 260 616 500 730 820 640 S 1255 512 1480 586",
  "M-80 762 C 300 706 520 802 840 726 S 1280 618 1480 682",
  "M-80 838 C 280 796 540 868 860 800 S 1300 704 1480 762",
];

/**
 * Scenery: two washes of green, a few long curves, four specks of light. Behind
 * everything, out of the accessibility tree, and inert to the pointer.
 *
 * The curves are what is left of the ruled grid that used to sit here. A grid
 * is a claim about precision, which is not what this screen is arguing; these
 * are slow and off-axis and read as the edge of something moving, which is
 * closer to it. Drawn as one `viewBox` stretched with
 * `preserveAspectRatio="none"` because none of it is a shape anybody will look
 * at directly — distortion at an unusual window size costs nothing here and
 * saves the curves having to be responsive.
 */
function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="agent-aurora absolute inset-0" />

      <svg
        className="absolute inset-0 size-full text-emerald-500/20"
        viewBox="0 0 1400 900"
        preserveAspectRatio="none"
        fill="none"
      >
        {/* `vectorEffect` keeps the stroke a hairline no matter how far the
            viewBox is stretched — without it the non-uniform scale thickens
            these into visible ribbons on a wide window. */}
        <g stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke">
          {CURVES.map((d) => (
            <path key={d} d={d} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>

      {SPARKS.map((spark) => (
        <span
          key={`${spark.left}-${spark.top}`}
          className="agent-spark absolute rounded-full"
          style={{
            left: spark.left,
            top: spark.top,
            width: spark.size,
            height: spark.size,
          }}
        />
      ))}
    </div>
  );
}

function ArrowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50",
        "flex size-7 items-center justify-center rounded-md transition-colors",
        "focus-visible:ring-2 focus-visible:outline-none",
      )}
    >
      {children}
    </button>
  );
}
