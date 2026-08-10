import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env";
import type { AiModel } from "@/types/database";

import type { ConversationTurn } from "./prompt";

/**
 * The Claude call behind the SMS chatbot (PRD 5).
 *
 * Generates only. Nothing in this module talks to Twilio or writes to the
 * database — deciding whether a generated reply is allowed to be sent is the
 * caller's job, and keeping that decision out of here means there is exactly
 * one place to audit it.
 */

/** Twilio's hard limit; the system prompt asks for far shorter than this. */
const MAX_SMS_LENGTH = 1600;

/**
 * Covers thinking *and* the reply — on models with thinking on, `max_tokens`
 * caps both together, and a tight budget truncates mid-sentence. Unused
 * output tokens aren't billed, so this is generous on purpose.
 */
const MAX_TOKENS = 4000;

/**
 * Per attempt. Two attempts worst case, so ~60s of wall clock — comfortably
 * inside the function budget, and far below the point where a lead has given
 * up on getting an answer.
 */
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;

/**
 * Per-model request shaping.
 *
 * The three models do not share a request surface: `effort` is rejected
 * outright by Haiku 4.5, and thinking is configured differently on each
 * generation. Encoded as data rather than discovered at runtime, because the
 * failure mode is a 400 in the middle of a live conversation.
 */
const MODEL_CAPABILITIES: Record<AiModel, { effort: boolean; thinking: boolean }> = {
  // Adaptive thinking is the default; effort supports the full ladder.
  "claude-sonnet-5": { effort: true, thinking: true },
  // Adaptive is the only on-mode, and omitting `thinking` means none at all.
  "claude-opus-4-8": { effort: true, thinking: true },
  // Older generation: `effort` errors, and thinking needs a token budget.
  // Omitted entirely — for a 300-character reply the latency isn't worth it.
  "claude-haiku-4-5-20251001": { effort: false, thinking: false },
};

/**
 * The model's output contract.
 *
 * Structured rather than free text so the handover signal is machine-readable.
 * `needs_human` is what flips `ai_enabled` off, and PRD 5 calls that the single
 * most important rule in the app — far too important to detect by string
 * matching the reply.
 *
 * The system prompt is Santiago's, sent verbatim; the shape is carried by these
 * descriptions rather than by appending instructions to his text.
 */
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description:
        "The text message to send back. Plain text only — no markdown, no formatting, no quotes around it.",
    },
    needs_human: {
      type: "boolean",
      description:
        "True when a real person should take over: pricing negotiation, an angry or upset customer, anything you were told not to handle, or anything you are unsure about.",
    },
  },
  required: ["reply", "needs_human"],
  additionalProperties: false,
} as const;

export type AiReplyResult =
  | {
      ok: true;
      reply: string;
      needsHuman: boolean;
      model: AiModel;
      inputTokens: number;
      outputTokens: number;
    }
  | { ok: false; error: string; retryable: boolean };

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic({
      apiKey: serverEnv.anthropicApiKey,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }
  return cachedClient;
}

/**
 * Classifies a thrown SDK error.
 *
 * `retryable` describes the error, not a policy — the caller decides whether
 * anything is worth retrying. Nothing here retries on its own beyond the SDK's
 * own bounded attempts.
 */
function describeError(error: unknown): { error: string; retryable: boolean } {
  if (error instanceof Anthropic.RateLimitError) {
    return { error: "Rate limited by the Anthropic API", retryable: true };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return { error: "ANTHROPIC_API_KEY is missing or invalid", retryable: false };
  }
  if (error instanceof Anthropic.NotFoundError) {
    return { error: "Model not found — check settings.ai_model", retryable: false };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { error: `Rejected by the API: ${error.message}`, retryable: false };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { error: "Could not reach the Anthropic API", retryable: true };
  }
  if (error instanceof Anthropic.APIError) {
    return { error: `API error ${error.status}: ${error.message}`, retryable: true };
  }
  return {
    error: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}

/**
 * Generates a reply for one conversation. Never throws.
 *
 * The caller runs on the tail of a Twilio webhook, where an unhandled rejection
 * is invisible — every failure comes back as a value instead.
 */
export async function generateAiReply({
  systemPrompt,
  model,
  conversation,
}: {
  systemPrompt: string;
  model: AiModel;
  conversation: ConversationTurn[];
}): Promise<AiReplyResult> {
  if (conversation.length === 0) {
    return { ok: false, error: "Nothing from the contact to reply to", retryable: false };
  }
  if (!systemPrompt.trim()) {
    // Without the business context the model would answer as a generic
    // assistant, which is worse than not answering.
    return { ok: false, error: "No AI system prompt is configured", retryable: false };
  }

  const capabilities = MODEL_CAPABILITIES[model];

  try {
    const response = await client().messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: conversation,
      ...(capabilities.thinking ? { thinking: { type: "adaptive" as const } } : {}),
      output_config: {
        // Low effort keeps latency down for a short reply. Thinking stays on
        // where supported rather than being disabled — on current models
        // disabling it can leak internal tags into the visible response, and
        // that response goes straight to a customer.
        ...(capabilities.effort ? { effort: "low" as const } : {}),
        format: { type: "json_schema" as const, schema: OUTPUT_SCHEMA },
      },
    });

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        error: `Model declined to answer (${response.stop_details?.category ?? "unspecified"})`,
        retryable: false,
      };
    }
    if (response.stop_reason === "max_tokens") {
      // The JSON is truncated, so there is nothing safe to parse.
      return { ok: false, error: "Reply hit the token limit", retryable: true };
    }

    const text = response.content.find((block) => block.type === "text")?.text;
    if (!text) {
      return { ok: false, error: "Model returned no text", retryable: true };
    }

    let parsed: { reply?: unknown; needs_human?: unknown };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      return { ok: false, error: "Model returned unparseable JSON", retryable: true };
    }

    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    if (!reply) {
      return { ok: false, error: "Model returned an empty reply", retryable: true };
    }
    if (reply.length > MAX_SMS_LENGTH) {
      // Refused rather than truncated: cutting a message mid-sentence sends a
      // lead something that reads as broken.
      return {
        ok: false,
        error: `Reply is ${reply.length} characters, over the ${MAX_SMS_LENGTH} SMS limit`,
        retryable: false,
      };
    }

    return {
      ok: true,
      reply,
      // Anything other than an explicit false means hand it over — the safe
      // direction when the flag is missing is towards a human.
      needsHuman: parsed.needs_human !== false,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    const described = describeError(error);
    console.error(`[ai] generation failed: ${described.error}`);
    return { ok: false, ...described };
  }
}
