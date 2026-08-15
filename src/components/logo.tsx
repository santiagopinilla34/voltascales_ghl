import Image from "next/image";

import logoLockup from "@/assets/volta-logo.png";
import logoMark from "@/assets/volta-logo-mark.png";
import { cn } from "@/lib/utils";

/**
 * The artwork ships as a single white-on-transparent PNG, and the light theme
 * gets its black logo by inverting that one file rather than from a second
 * asset. Two files would be two things to keep in sync; this way the themes
 * cannot drift apart.
 *
 * Doing the flip in CSS also means the correct colour is painted on the very
 * first frame, alongside next-themes' blocking class write — swapping `src`
 * from JS would show the wrong logo until hydration, which is exactly the
 * white flash the theme script exists to avoid.
 *
 * `invert()` operates on colour channels only, so the transparent background
 * stays transparent in both themes.
 */
const THEME_FLIP = "invert dark:invert-0";

/**
 * Full lockup: bolt mark plus wordmark, ~5:1. Size it by height and let the
 * width follow.
 *
 * Both this and {@link LogoMark} are margin-trimmed crops of the source
 * `volta_logo_long.png`, which carries about a quarter of its box in empty
 * padding — enough to visibly push the logo off the left edge the nav icons
 * below it line up on.
 */
export function Logo({
  className,
  /**
   * Only for a logo that is both the page's hero and certain to be visible —
   * the sign-in page. Preloading one that a collapsed sidebar has hidden would
   * fetch bytes the viewer never sees, and in-viewport lazy images are fetched
   * on sight anyway.
   */
  priority,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={logoLockup}
      alt="VoltaScales"
      priority={priority}
      // shrink-0: in a tight flex row the width would give way while `h-*`
      // holds the height, stretching the wordmark rather than clipping it.
      className={cn(THEME_FLIP, "w-auto shrink-0", className)}
    />
  );
}

/** Just the bolt mark, square, for places too narrow for the wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src={logoMark}
      alt="VoltaScales"
      className={cn(THEME_FLIP, "shrink-0", className)}
    />
  );
}
