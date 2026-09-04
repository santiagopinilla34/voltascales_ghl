import {
  BatteryFull,
  BookOpen,
  Check,
  Clock,
  DollarSign,
  MessageSquare,
  Mic,
  Phone,
  Signal,
  Wifi,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The picture beside each slide on Getting Started.
 *
 * All three are drawings, not working software — a phone-shaped frame with a
 * still of what the agent looks like doing its job. Nothing in here is a
 * control: the "Start test call" pill cannot be pressed, because Voice AI has
 * not been built yet and a button that does nothing is worse than a picture of
 * one. When these screens exist, the pill becomes a real button and this
 * component loses a slide at a time.
 *
 * The whole thing is `aria-hidden`. Every word in it is repeated in the
 * headline and paragraph beside it, so to a screen reader this is decoration
 * that would otherwise be read out twice.
 */

/**
 * The side buttons, as a fraction of the phone's height.
 *
 * The real positions, because they are the detail that sells the shape: a
 * silent switch and two volume keys down the left, a longer power key on the
 * right, and the power key sitting between the two volume keys rather than
 * opposite either of them.
 */
const SIDE_KEYS = [
  { side: "left", top: "11.8%", height: "4%" },
  { side: "left", top: "18.5%", height: "7.6%" },
  { side: "left", top: "27.7%", height: "7.6%" },
  { side: "right", top: "24.4%", height: "11.8%" },
] as const;

/**
 * The phone: bezel, keys, island, status bar, and whatever the slide puts on
 * the screen.
 *
 * Sized by aspect ratio rather than a fixed height, and the ratio is the one a
 * real phone has — 9:19.5, which is what an iPhone from the last several years
 * measures. The first version was 296x480, near enough 9:14.6, and a phone
 * that much too short reads as a squashed picture of a phone: the eye knows
 * this shape well enough to notice a wrong one without being able to say why.
 *
 * The same knowledge is why the frame is now three layers rather than a
 * rounded border. A single-stroke outline reads as an icon of a phone; what
 * makes it read as a photograph of one is that the edge catches light — a
 * bright rim on the outside, a dark band, and the screen sitting below both
 * with its own smaller radius. The keys are the other half of it, and they
 * cost four spans.
 *
 * The frame stays dark in both themes. A white phone against a white page has
 * no silhouette at all, and no real device changes colour when the app it is
 * displayed in does.
 */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden className="relative w-full max-w-[17.5rem] shrink-0">
      {SIDE_KEYS.map((key) => (
        <span
          key={`${key.side}-${key.top}`}
          style={{ top: key.top, height: key.height }}
          className={cn(
            "absolute w-[4px] bg-neutral-700",
            // Tucked behind the shell so only the sliver past its edge shows,
            // which is all you ever see of a real one.
            key.side === "left"
              ? "left-[-2px] rounded-l-[2px]"
              : "right-[-2px] rounded-r-[2px]",
          )}
        />
      ))}

      {/* The band. A flat fill made the frame read as a cut-out rather than as
          metal; the diagonal gradient is the whole difference, because a milled
          edge is bright where it turns towards the light and dark where it
          turns away, and that happens on opposite corners. */}
      <div className="relative flex aspect-[9/19.5] flex-col rounded-[2.75rem] bg-[linear-gradient(150deg,var(--tw-gradient-stops))] from-neutral-500 via-neutral-800 via-35% to-neutral-600 p-[10px] shadow-2xl shadow-black/30 dark:shadow-black/60">
        {/* The polish on the outer edge, as a hairline inside the band rather
            than a ring around it — a ring sits outside the radius and reads as
            a stroke on a shape, which is what we are trying not to look like. */}
        <span className="pointer-events-none absolute inset-0 rounded-[2.75rem] ring-1 ring-white/20 ring-inset" />

        {/* The screen. `overflow-hidden` here rather than on the frame so the
            content is clipped by the glass, not by the metal, and the black
            ring is the gap between the two that every phone has. */}
        <div className="bg-card relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2.25rem] ring-1 ring-black/80">
          {/* Glass catches the light at the top. Two percent of white, which
              is almost nothing and is the point — at any more it stops being a
              reflection and starts being a gradient somebody chose. */}
          <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-white/[0.045] to-transparent" />

          {/* Status bar. The 9:41 is the one everybody's phone shows in a
              mockup, and picking the real time here would date the
              screenshot. */}
          <div className="text-foreground/70 relative flex h-9 shrink-0 items-center justify-between px-4 pt-1 text-[0.6875rem] font-medium">
            <span className="tabular-nums">9:41</span>
            <span className="flex items-center gap-1">
              <Signal className="size-3" />
              <Wifi className="size-3" />
              <BatteryFull className="size-3.5" />
            </span>
          </div>

          {/* The island, over the status bar rather than inside it, so the time
              and the icons lay themselves out as if it were not there — which
              is how the real one behaves. Always near-black: it is a hole in
              the screen, and a hole does not follow the theme. */}
          <span className="absolute top-[7px] left-1/2 z-20 flex h-[22px] w-[5.25rem] -translate-x-1/2 items-center justify-end rounded-full bg-neutral-950 pr-2">
            {/* The lens, and the ring of glass around it. */}
            <span className="size-2 rounded-full bg-neutral-800 ring-1 ring-neutral-700/80">
              <span className="mt-[1px] ml-[1px] block size-[3px] rounded-full bg-neutral-600/70" />
            </span>
          </span>

          <div className="flex min-h-0 flex-1 flex-col px-1 pt-1.5 pb-1">
            {children}
          </div>

          {/* The home indicator. Small thing, but it is the bar every phone has
              along the bottom edge and the shape looks unfinished without it. */}
          <span className="bg-foreground/30 mx-auto mb-2 h-1 w-[6.5rem] shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** The row at the top of a screen: who you are talking to, and their state. */
function AppBar({
  initials,
  name,
  status,
}: {
  initials: string;
  name: string;
  status: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 px-2 pb-3">
      <span className="bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold">
        {initials}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[0.8125rem] font-semibold">{name}</span>
        <span className="text-muted-foreground flex items-center gap-1 text-[0.6875rem]">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {status}
        </span>
      </span>
    </div>
  );
}

/**
 * Voice AI: the agent waiting to pick up.
 *
 * Not on Getting Started at the moment — the chatbot leads instead, because it
 * is the one being built first and the one worth explaining. Kept rather than
 * deleted because "for now" was the word used, and this comes back the day
 * voice does.
 */
export function VoicePhone() {
  return (
    <PhoneFrame>
      <AppBar initials="VS" name="VoltaScales" status="Ready to test" />

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
        <span className="relative flex size-32 items-center justify-center">
          {/* Three rings on the same animation, offset in time so one is
              always leaving as another arrives. */}
          {[0, 1, 2].map((ring) => (
            <span
              key={ring}
              className="agent-orb-ring border-foreground/25 absolute inset-0 rounded-full border"
              style={{ animationDelay: `${ring * 1.05}s` }}
            />
          ))}
          <span className="bg-background flex size-14 items-center justify-center rounded-full border shadow-sm">
            <Mic className="size-5" />
          </span>
        </span>

        <p className="text-muted-foreground max-w-[13rem] text-center text-[0.6875rem] leading-relaxed">
          Tap the orb to place a live test call and hear how your agent answers.
        </p>
      </div>

      <div className="shrink-0 px-2 pb-2">
        <span className="bg-foreground text-background flex h-9 items-center justify-center gap-1.5 rounded-full text-[0.75rem] font-medium">
          <Phone className="size-3.5" />
          Start test call
        </span>
      </div>
    </PhoneFrame>
  );
}

/** Conversation AI: a lead answered before anybody in the office saw it. */
export function ConversationPhone() {
  // Long enough to fill the frame, and picked to show the two things the
  // chatbot is actually for: it knows the price without asking anyone, and it
  // gets to a booked time rather than to "someone will call you back".
  const thread = [
    { from: "them", text: "Hi — what do you charge for a full service?" },
    {
      from: "us",
      text: "$180, and it takes about two hours. Want me to find you a slot?",
    },
    { from: "them", text: "Yes please, anything this week?" },
    {
      from: "us",
      text: "Thursday 2pm or Friday 10am are both open — which suits you?",
    },
    { from: "them", text: "Thursday works" },
  ] as const;

  return (
    <PhoneFrame>
      <AppBar initials="AI" name="Conversation AI" status="Answering" />

      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 px-2 pb-2">
        {thread.map((message, index) => (
          <span
            key={index}
            className={
              message.from === "us"
                ? "bg-foreground text-background ml-auto max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-[0.75rem] leading-snug"
                : "bg-muted mr-auto max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 text-[0.75rem] leading-snug"
            }
          >
            {message.text}
          </span>
        ))}

        {/* Mid-reply, so the picture has a present tense to it. */}
        <span className="bg-foreground ml-auto flex items-center gap-1 rounded-2xl rounded-br-sm px-3 py-2.5">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="agent-typing-dot bg-background size-1.5 rounded-full"
              style={{ animationDelay: `${dot * 0.18}s` }}
            />
          ))}
        </span>
      </div>

      <div className="text-muted-foreground shrink-0 px-2 pb-2">
        <span className="border-input flex h-9 items-center rounded-full border px-3.5 text-[0.75rem]">
          Type to take over…
        </span>
      </div>
    </PhoneFrame>
  );
}

/** Knowledge Base: the facts both agents answer from. */
export function KnowledgePhone() {
  const sources = [
    { icon: DollarSign, label: "Pricing and packages", meta: "6 items" },
    { icon: Clock, label: "Opening hours", meta: "Mon–Sat" },
    { icon: BookOpen, label: "Services offered", meta: "11 items" },
    { icon: MessageSquare, label: "Common questions", meta: "18 saved" },
  ];

  return (
    <PhoneFrame>
      <AppBar initials="KB" name="Knowledge Base" status="Trained" />

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2">
        {sources.map((source) => (
          <span
            key={source.label}
            className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
          >
            <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
              <source.icon className="size-3.5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[0.75rem] font-medium">
                {source.label}
              </span>
              <span className="text-muted-foreground text-[0.6875rem]">
                {source.meta}
              </span>
            </span>
            <Check className="size-3.5 shrink-0 text-emerald-500" />
          </span>
        ))}

        <p className="text-muted-foreground mt-auto pb-3 text-center text-[0.6875rem]">
          Every agent answers from this. Change it once, they all change.
        </p>
      </div>
    </PhoneFrame>
  );
}
