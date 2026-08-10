import type { AiMode, AiModel } from "@/types/database";

/**
 * Options for the Settings dropdowns.
 *
 * Client-safe on purpose — no `server-only` import — because the Settings form
 * is a Client Component. Keep request-shaping details (which models accept an
 * effort parameter, thinking configuration) out of here; those live in
 * `generate.ts`, which never reaches the browser.
 */

export const AI_MODE_OPTIONS: {
  value: AiMode;
  label: string;
  description: string;
}[] = [
  {
    value: "off",
    label: "Off",
    description: "The AI is never called. Inbound texts wait for you.",
  },
  {
    value: "draft",
    label: "Draft only",
    description:
      "Generates a reply for every inbound text and shows it in the Inbox. Sends nothing.",
  },
  {
    value: "live",
    label: "Live",
    description: "Replies are sent by SMS to contacts with AI handling on.",
  },
];

export const AI_MODEL_OPTIONS: {
  value: AiModel;
  label: string;
  description: string;
}[] = [
  {
    value: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    description: "Balanced speed and quality. The default.",
  },
  {
    value: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    description: "Strongest, slowest, most expensive.",
  },
  {
    value: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    description: "Fastest and cheapest. Best when replies are simple.",
  },
];

export function aiModelLabel(model: string): string {
  return AI_MODEL_OPTIONS.find((option) => option.value === model)?.label ?? model;
}
