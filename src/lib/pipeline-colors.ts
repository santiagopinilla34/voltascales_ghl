import type { StageColor, StageColorMode } from "@/types/database";

/**
 * The palette a pipeline stage picks its colour from.
 *
 * Client-safe on purpose — no `server-only` import — because the picker, the
 * board and the pipelines list are all Client Components. This is the
 * vocabulary they share; the queries live in `pipelines.ts`.
 *
 * Tokens rather than hex strings, and the classes written out in full rather
 * than composed as `bg-${token}-500`: Tailwind scans source text for complete
 * class names, so an interpolated one is never generated and the swatch comes
 * out unstyled. Every class below has to appear literally somewhere for the
 * stylesheet to contain it, and this is that somewhere.
 *
 * The order is the order of the picker grid: twenty tokens laid out ten to a
 * row, the hues running once around the wheel and the four neutrals last.
 */
export const STAGE_COLORS: {
  value: StageColor;
  label: string;
  /** The filled swatch, and the dot in `dot` mode. */
  dot: string;
  /** The hairline across the top of this stage's column on the board. */
  accent: string;
  /** The soft fill in `background` mode: tint, text and hairline together. */
  surface: string;
}[] = [
  {
    value: "blue",
    label: "Blue",
    dot: "bg-blue-500",
    accent: "from-blue-500 to-transparent",
    surface: "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20",
  },
  {
    value: "indigo",
    label: "Indigo",
    dot: "bg-indigo-500",
    accent: "from-indigo-500 to-transparent",
    surface:
      "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20",
  },
  {
    value: "violet",
    label: "Violet",
    dot: "bg-violet-500",
    accent: "from-violet-500 to-transparent",
    surface:
      "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20",
  },
  {
    value: "purple",
    label: "Purple",
    dot: "bg-purple-500",
    accent: "from-purple-500 to-transparent",
    surface:
      "bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20",
  },
  {
    value: "fuchsia",
    label: "Fuchsia",
    dot: "bg-fuchsia-500",
    accent: "from-fuchsia-500 to-transparent",
    surface:
      "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300 border-fuchsia-500/20",
  },
  {
    value: "pink",
    label: "Pink",
    dot: "bg-pink-500",
    accent: "from-pink-500 to-transparent",
    surface: "bg-pink-500/10 text-pink-600 dark:text-pink-300 border-pink-500/20",
  },
  {
    value: "rose",
    label: "Rose",
    dot: "bg-rose-500",
    accent: "from-rose-500 to-transparent",
    surface: "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/20",
  },
  {
    value: "red",
    label: "Red",
    dot: "bg-red-500",
    accent: "from-red-500 to-transparent",
    surface: "bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/20",
  },
  {
    value: "orange",
    label: "Orange",
    dot: "bg-orange-500",
    accent: "from-orange-500 to-transparent",
    surface:
      "bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-500/20",
  },
  {
    value: "amber",
    label: "Amber",
    dot: "bg-amber-500",
    accent: "from-amber-500 to-transparent",
    surface:
      "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20",
  },
  {
    value: "yellow",
    label: "Yellow",
    dot: "bg-yellow-500",
    accent: "from-yellow-500 to-transparent",
    surface:
      "bg-yellow-500/10 text-yellow-600 dark:text-yellow-300 border-yellow-500/20",
  },
  {
    value: "lime",
    label: "Lime",
    dot: "bg-lime-500",
    accent: "from-lime-500 to-transparent",
    surface: "bg-lime-500/10 text-lime-600 dark:text-lime-300 border-lime-500/20",
  },
  {
    value: "green",
    label: "Green",
    dot: "bg-green-500",
    accent: "from-green-500 to-transparent",
    surface:
      "bg-green-500/10 text-green-600 dark:text-green-300 border-green-500/20",
  },
  {
    value: "emerald",
    label: "Emerald",
    dot: "bg-emerald-500",
    accent: "from-emerald-500 to-transparent",
    surface:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20",
  },
  {
    value: "teal",
    label: "Teal",
    dot: "bg-teal-500",
    accent: "from-teal-500 to-transparent",
    surface: "bg-teal-500/10 text-teal-600 dark:text-teal-300 border-teal-500/20",
  },
  {
    value: "cyan",
    label: "Cyan",
    dot: "bg-cyan-500",
    accent: "from-cyan-500 to-transparent",
    surface: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20",
  },
  {
    value: "sky",
    label: "Sky",
    dot: "bg-sky-500",
    accent: "from-sky-500 to-transparent",
    surface: "bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/20",
  },
  {
    value: "slate",
    label: "Slate",
    dot: "bg-slate-500",
    accent: "from-slate-500 to-transparent",
    surface:
      "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20",
  },
  {
    value: "zinc",
    label: "Zinc",
    dot: "bg-zinc-500",
    accent: "from-zinc-500 to-transparent",
    surface: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20",
  },
  {
    value: "stone",
    label: "Stone",
    dot: "bg-stone-500",
    accent: "from-stone-500 to-transparent",
    surface:
      "bg-stone-500/10 text-stone-600 dark:text-stone-300 border-stone-500/20",
  },
];

/** What a stage starts as, and what an unrecognised token falls back to. */
export const DEFAULT_STAGE_COLOR: StageColor = "slate";

export const STAGE_COLOR_MODES: {
  value: StageColorMode;
  label: string;
  hint: string;
}[] = [
  { value: "none", label: "Default", hint: "No colour" },
  { value: "dot", label: "Coloured dot", hint: "A dot beside the name" },
  { value: "background", label: "Background", hint: "Filled behind the name" },
];

export function isStageColor(value: unknown): value is StageColor {
  return STAGE_COLORS.some((color) => color.value === value);
}

export function isStageColorMode(value: unknown): value is StageColorMode {
  return STAGE_COLOR_MODES.some((mode) => mode.value === value);
}

/**
 * The hairline across the top of a board column.
 *
 * Shown in every mode including `none`, unlike the dot and the fill: the rim
 * is how the eye finds "Closed" on a board scrolled sideways without reading
 * six headings, and a pipeline set to no colour still needs its columns told
 * apart. `none` gets one neutral rim rather than no rim at all.
 */
export function stageAccent(color: string, mode: StageColorMode): string {
  if (mode === "none") return "from-muted-foreground/40 to-transparent";

  const entry =
    STAGE_COLORS.find((item) => item.value === color) ??
    STAGE_COLORS.find((item) => item.value === DEFAULT_STAGE_COLOR)!;

  return entry.accent;
}

/**
 * The classes for one stage, resolved against the pipeline's display mode.
 *
 * One function rather than each caller reaching into the table, because "which
 * mode am I in" is the question every renderer of a stage has to answer and
 * getting it wrong is silent — a dot in `background` mode just looks like a
 * design someone chose.
 */
export function stageColorClasses(
  color: string,
  mode: StageColorMode,
): { dot: string | null; surface: string | null } {
  const entry =
    STAGE_COLORS.find((item) => item.value === color) ??
    STAGE_COLORS.find((item) => item.value === DEFAULT_STAGE_COLOR)!;

  return {
    dot: mode === "dot" ? entry.dot : null,
    surface: mode === "background" ? entry.surface : null,
  };
}
