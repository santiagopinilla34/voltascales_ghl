import type { AiModel } from "@/types/database";

/**
 * Options for the model pickers.
 *
 * Client-safe on purpose — no `server-only` import — because the Goals tab is
 * a Client Component. Keep request-shaping details (which models accept an
 * effort parameter, thinking configuration) out of here; those live in
 * `generate.ts` and `generate-openai.ts`, which never reach the browser.
 *
 * `provider` is the exception, and it earns its place: it is what the picker
 * groups by and what `generateAiReply` dispatches on, so the one list that says
 * which models exist is also the one list that says who serves them. Deriving
 * it from the id with a prefix test would work today and quietly break the
 * first time a vendor ships a model that does not start with its own name.
 */

export type AiProvider = "anthropic" | "openai";

export const AI_MODEL_OPTIONS: {
  value: AiModel;
  label: string;
  description: string;
  provider: AiProvider;
}[] = [
  {
    value: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    description: "Balanced speed and quality. The default.",
    provider: "anthropic",
  },
  {
    value: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    description: "Strongest, slowest, most expensive.",
    provider: "anthropic",
  },
  {
    value: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    description: "Fastest and cheapest Claude. Best when replies are simple.",
    provider: "anthropic",
  },
  // The OpenAI budget tier. Every one of these was checked against the live API
  // before being listed: each accepts a JSON-schema structured output, a
  // function tool and a `low` reasoning effort in the same request, which is
  // the whole of what this chatbot asks a model to do. A model that fails any
  // of the three cannot answer a text and does not belong in this list.
  //
  // Deliberately excluded: `gpt-4.1-mini` and `gpt-4o-mini` both work, but they
  // are a generation older, take no reasoning effort, and cost more than
  // `gpt-5-nano` while doing less. `gpt-4.1-nano` is scheduled for shutdown on
  // 2026-10-23 and would become a dead option in the dropdown.
  {
    value: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    description: "Cheapest current-generation OpenAI. A tenth of Sonnet 5.",
    provider: "openai",
  },
  {
    value: "gpt-5.4-nano",
    label: "GPT-5.4 nano",
    description: "Same price as Luna, a generation behind it.",
    provider: "openai",
  },
  {
    value: "gpt-5-mini",
    label: "GPT-5 mini",
    description: "More capable than the nanos, still well under Haiku.",
    provider: "openai",
  },
  {
    value: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    description: "The strongest of the budget models, and the dearest.",
    provider: "openai",
  },
  {
    value: "gpt-5-nano",
    label: "GPT-5 nano",
    description: "The cheapest thing that works. Expect it to need short questions.",
    provider: "openai",
  },
];

export function aiModelLabel(model: string): string {
  return (
    AI_MODEL_OPTIONS.find((option) => option.value === model)?.label ?? model
  );
}

/**
 * Who serves a model.
 *
 * Anthropic for anything unrecognised, which is the honest default rather than
 * a lucky one: every model that predates this function is Anthropic's, and a
 * saved row naming a model that has since been removed from the list should
 * fail the way it always did — a `NotFoundError` from the API naming the model
 * — rather than being routed to a second vendor that has never heard of it.
 */
export function aiModelProvider(model: string): AiProvider {
  return (
    AI_MODEL_OPTIONS.find((option) => option.value === model)?.provider ??
    "anthropic"
  );
}
