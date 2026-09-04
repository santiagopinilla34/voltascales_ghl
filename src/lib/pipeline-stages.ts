import type { PipelineStage } from "@/types/database";

/**
 * The board's columns, left to right.
 *
 * Client-safe on purpose — no `server-only` import — because the board and its
 * move menu are Client Components. Query code lives in `pipeline.ts`, which is
 * server-only; this is just the vocabulary both halves share.
 *
 * Order is the board order. It is also the order the check constraint lists,
 * but nothing enforces that pairing: adding a stage means editing both this
 * array and a migration.
 *
 * `accent` is the hairline that runs across the top of the column. It is the
 * one place a stage gets a colour, so the eye can find "Closed" on a board
 * scrolled sideways without reading six headings — which is why the two ends
 * of the pipeline are the two that read as green, and the middle stages sit in
 * blue and violet rather than each getting a hue of their own.
 */
export const PIPELINE_STAGES: {
  value: PipelineStage;
  label: string;
  accent: string;
}[] = [
  {
    value: "interested",
    label: "Interested",
    accent: "from-blue-500 to-violet-600",
  },
  {
    value: "booked",
    label: "Booked",
    accent: "from-emerald-400 to-transparent",
  },
  {
    value: "attended",
    label: "Attended",
    accent: "from-emerald-400 to-transparent",
  },
  {
    value: "not_attended",
    label: "Not Attended",
    accent: "from-blue-500 to-violet-600",
  },
  { value: "closed", label: "Closed", accent: "from-teal-400 to-green-600" },
  {
    value: "contact_again_later",
    label: "Contact Again Later",
    accent: "from-green-400 to-green-700",
  },
  {
    value: "not_closed",
    label: "Not Closed",
    accent: "from-rose-500 to-transparent",
  },
];

export function isPipelineStage(value: unknown): value is PipelineStage {
  return PIPELINE_STAGES.some((stage) => stage.value === value);
}

export function pipelineStageLabel(stage: string): string {
  return PIPELINE_STAGES.find((entry) => entry.value === stage)?.label ?? stage;
}
