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
  PhoneCall,
  type LucideIcon,
} from "lucide-react";

import {
  ConversationPhone,
  KnowledgePhone,
  VoicePhone,
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

const SLIDES: Slide[] = [
  {
    key: "voice",
    eyebrow: "Voice agent",
    eyebrowIcon: PhoneCall,
    headline: ["Never miss a call,", "ever again"],
    body: "Your Voice Agent picks up every call to your business, day or night — booking appointments, quoting your prices, answering the questions you get asked twenty times a week, and taking down the details of anyone who wants a call back. Nobody reaches a voicemail, and nobody rings the next company on the list while your line is busy.",
    ctaLabel: "Set up Voice AI",
    ctaHref: "/ai-agents/voice",
    mockup: <VoicePhone />,
  },
  {
    key: "conversation",
    eyebrow: "Conversation agent",
    eyebrowIcon: MessageSquare,
    headline: ["Reply in seconds,", "not tomorrow morning"],
    body: "Most leads go to whoever answers first. Your Conversation Agent watches the inbox and replies the moment a message arrives — working out what they need, offering the times you actually have free, and booking the one they pick. The moment you start typing, it steps out of the way.",
    ctaLabel: "Set up Conversation AI",
    ctaHref: "/ai-agents/conversation",
    mockup: <ConversationPhone />,
  },
  {
    key: "knowledge-base",
    eyebrow: "Knowledge base",
    eyebrowIcon: BookOpen,
    headline: ["Trained on your business,", "not on the internet"],
    body: "An agent is only as good as what it knows. This is where you put your prices, your hours, your services and the answers you would give yourself — and every agent you run reads from it. Put your rates up once here and both agents quote the new ones from the next call onwards.",
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
    body: "The call at 9pm and the message on Saturday get the same answer as the ones at eleven on a Tuesday.",
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
      {/* Scenery, behind everything and out of the accessibility tree. */}
      <div aria-hidden className="agent-grid absolute inset-0 -z-10" />

      <div className="mx-auto flex w-full min-w-0 max-w-[1140px] flex-col px-4 py-5 sm:px-6 lg:px-10">
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
          className="page-enter grid flex-1 items-center gap-10 py-10 lg:grid-cols-2 lg:gap-12 lg:py-16"
        >
          <div className="flex min-w-0 flex-col items-start">
            <span className="text-muted-foreground flex items-center gap-2 text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
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
            makes the case, this is for whoever wants it in three lines. */}
        <div className="grid gap-6 border-t pt-8 pb-6 sm:grid-cols-3 sm:gap-8">
          {PROMISES.map((promise) => (
            <div key={promise.title} className="flex min-w-0 flex-col gap-2">
              <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-lg">
                <promise.icon className="size-4" />
              </span>
              <h3 className="text-sm font-medium">{promise.title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {promise.body}
              </p>
            </div>
          ))}
        </div>
      </div>
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
