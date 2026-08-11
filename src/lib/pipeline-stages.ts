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
 */
export const PIPELINE_STAGES: { value: PipelineStage; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "booked", label: "Booked" },
  { value: "attended", label: "Attended" },
  { value: "not_attended", label: "Not Attended" },
  { value: "closed", label: "Closed" },
  { value: "contact_again_later", label: "Contact Again Later" },
  { value: "not_closed", label: "Not Closed" },
];

export function isPipelineStage(value: unknown): value is PipelineStage {
  return PIPELINE_STAGES.some((stage) => stage.value === value);
}

export function pipelineStageLabel(stage: string): string {
  return PIPELINE_STAGES.find((entry) => entry.value === stage)?.label ?? stage;
}
