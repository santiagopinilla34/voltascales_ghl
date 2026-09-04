import logoMark from "@/assets/volta-logo-mark.png";
import { cn } from "@/lib/utils";

/**
 * The mark is green and the wordmark is not, which the artwork could not do.
 *
 * Both used to be one white-on-transparent PNG flipped to black with
 * `invert()` for the light theme. That gave a logo which was always exactly
 * one colour, and the brand's is two — a green bolt against a wordmark that
 * takes the foreground colour. `invert()` works on the whole image, so there
 * was no version of that file which coloured the bolt and left the letters
 * alone.
 *
 * So the bolt is now painted rather than drawn: the PNG becomes a mask, its
 * alpha channel cuts the shape, and the colour comes from `background`. The
 * artwork stays the source of the silhouette — no one has retraced it as a
 * path, and it cannot drift from the file — but the colour is ours.
 *
 * The wordmark is set in the app's own typeface. It is two words in a plain
 * grotesque with a weight change between them, which Inter reproduces exactly,
 * and as text it takes the theme's foreground for free, wraps never, and costs
 * no bytes. It also puts a real word in the accessibility tree instead of an
 * alt attribute on a picture of one.
 */

/** Shared by both exports so the silhouette is described in one place. */
const MARK_MASK = {
  maskImage: `url(${logoMark.src})`,
  maskSize: "contain",
  maskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskImage: `url(${logoMark.src})`,
  WebkitMaskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
} as const;

/**
 * Full lockup: bolt plus wordmark. Size it by height — `h-7` on the sidebar,
 * `h-8` on sign-in — and the type scales with it.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="VoltaScales"
      className={cn("flex shrink-0 items-center gap-2", className)}
    >
      <LogoMark className="h-full" />
      {/* A fixed size rather than one derived from the box: `em` resolves
          against the inherited font-size, not the height the caller set, so
          tying it to `h-*` is not something CSS will do. 18px is the size that
          puts the wordmark's ascenders level with the bolt's shoulders at the
          h-7 every in-app use asks for. */}
      <span
        aria-hidden
        className="text-[1.125rem] leading-none font-bold tracking-tight whitespace-nowrap"
      >
        volta
        <span className="text-muted-foreground font-normal">Scales</span>
      </span>
    </span>
  );
}

/**
 * Just the bolt, square, for places too narrow for the wordmark — the collapsed
 * sidebar rail, chiefly.
 *
 * `aspect-square` rather than a width: given only `h-7` a masked span has no
 * intrinsic size to get its width from, the way an `<img>` would.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      style={MARK_MASK}
      className={cn(
        "block aspect-square shrink-0 bg-emerald-500 dark:bg-emerald-400",
        className,
      )}
    />
  );
}
