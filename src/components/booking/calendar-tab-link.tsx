import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * One tab in the calendar area's header rows.
 *
 * These navigate, so they are links rather than tab triggers — a link styled
 * as a trigger reads as a control that does not move the URL. They were
 * written twice, once on the calendar page and once on its settings page, and
 * the two had already drifted apart in their gaps; the active state is a
 * three-part thing now, which is more than is worth keeping in step by hand.
 *
 * ## Why the marker is not `border-primary`
 *
 * It was, and it came out white. `--primary` in the dark theme is
 * `oklch(0.922 0 0)` — a near-white grey — so the underline meant "active" in
 * the same colourless way the surrounding text does. The brand's signal for
 * "this is the thing you are on" is the green pip in the sidebar, and this is
 * the same idea one level in, so it is the same green: a pip above and a lit
 * rule below, both `emerald-500` with the glow that makes a 2px line read as
 * lit rather than merely drawn.
 *
 * The transparent border stays on every tab, active or not, so switching tabs
 * cannot change the row's height. The rule is painted over it.
 *
 * ## Why the pip is inside the link's padding
 *
 * It hung above the link on a negative offset first, and never appeared. The
 * row it sits in scrolls sideways, and `overflow-x: auto` computes the block
 * axis to `auto` as well — so anything drawn above the link's box was clipped
 * by the scroller, silently. The tab carries the space itself instead: `pt-3`
 * is the pip's room, and the pip sits inside it.
 */
export function CalendarTabLink({
  href,
  label,
  active,
  /** Type scale, for the row this sits in — the two rows are not the same size. */
  className,
}: {
  href: string;
  label: string;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative shrink-0 border-b-2 border-transparent px-1 pt-3 pb-1.5 text-xs whitespace-nowrap transition-colors",
        active
          ? "text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute top-0.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-emerald-500 shadow-[0_0_7px_1px] shadow-emerald-500/50"
        />
      )}

      {label}

      {active && (
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-emerald-500 shadow-[0_0_8px_1px] shadow-emerald-500/60"
        />
      )}
    </Link>
  );
}
