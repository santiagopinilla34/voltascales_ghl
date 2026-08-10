import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env";
import type { AiModel } from "@/types/database";

import { looksCorrupted } from "./integrity";
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
 * `effort` is rejected outright by Haiku 4.5, so it cannot be sent
 * unconditionally. Encoded as data rather than discovered at runtime, because
 * the failure mode is a 400 in the middle of a live conversation.
 *
 * Thinking is off everywhere — see THINKING below.
 */
const MODEL_SUPPORTS_EFFORT: Record<AiModel, boolean> = {
  "claude-sonnet-5": true,
  "claude-opus-4-8": true,
  // Older generation: `effort` errors on this model.
  "claude-haiku-4-5-20251001": false,
};

/**
 * Thinking is disabled for this task.
 *
 * Writing one short text message needs no reasoning, and leaving thinking on
 * cost more than it bought:
 *
 * - A draft generated in testing came back visibly corrupted — the reply began
 *   mid-word and had words missing from the middle. It was the one generation
 *   where heavy thinking occurred (294 output tokens against 26–107 in every
 *   clean run), on an input byte-identical to a clean generation seconds
 *   earlier. 27 attempts could not reproduce it, so this is a correlation
 *   rather than a proven cause — but the state it correlates with buys us
 *   nothing here.
 * - It made `outputTokens` useless as an integrity signal, because thinking
 *   tokens are counted in it. With thinking off the count tracks the reply,
 *   which is what makes the check below possible at all.
 * - On a 6-case handoff test, thinking off scored 6/6 against 5/6 with it on,
 *   at comparable latency. There was no accuracy to protect.
 */
const THINKING = { type: "disabled" as const };

/** Reply sanity checks live in `integrity.ts`, kept pure so they're testable. */

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

  // The integrity check below rejects a visibly damaged reply. That failure has
  // only ever been seen once in ~30 generations, so a single retry is very
  // likely to succeed — and retrying is far better than the alternatives, which
  // are sending a mangled text or going silent on a lead.
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await attemptGeneration({ systemPrompt, model, conversation });

    if (result.ok || !result.regenerate) {
      return result.ok ? result : { ok: false, error: result.error, retryable: result.retryable };
    }

    lastError = result.error;
    console.warn(`[ai] discarding attempt ${attempt}: ${result.error}`);
  }

  return { ok: false, error: lastError, retryable: true };
}

type Attempt =
  | (Extract<AiReplyResult, { ok: true }> & { regenerate?: false })
  | { ok: false; error: string; retryable: boolean; regenerate: boolean };

async function attemptGeneration({
  systemPrompt,
  model,
  conversation,
}: {
  systemPrompt: string;
  model: AiModel;
  conversation: ConversationTurn[];
}): Promise<Attempt> {
  try {
    const response = await client().messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: conversation,
      thinking: THINKING,
      output_config: {
        // Low effort keeps latency down for a reply that needs no deliberation.
        ...(MODEL_SUPPORTS_EFFORT[model] ? { effort: "low" as const } : {}),
        format: { type: "json_schema" as const, schema: OUTPUT_SCHEMA },
      },
    });

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        error: `Model declined to answer (${response.stop_details?.category ?? "unspecified"})`,
        retryable: false,
        regenerate: false,
      };
    }
    if (response.stop_reason === "max_tokens") {
      // The JSON is truncated, so there is nothing safe to parse.
      return {
        ok: false,
        error: "Reply hit the token limit",
        retryable: true,
        regenerate: false,
      };
    }

    // Every text block, concatenated — not just the first. A response has only
    // ever contained one, but taking `[0]` of a split payload would parse a
    // fragment as if it were whole, which is precisely the class of bug this
    // function must not have.
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (!text) {
      return {
        ok: false,
        error: "Model returned no text",
        retryable: true,
        regenerate: false,
      };
    }

    let parsed: { reply?: unknown; needs_human?: unknown };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      return {
        ok: false,
        error: "Model returned unparseable JSON",
        retryable: true,
        regenerate: true,
      };
    }

    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    if (!reply) {
      return {
        ok: false,
        error: "Model returned an empty reply",
        retryable: true,
        regenerate: true,
      };
    }

    const corruption = looksCorrupted(reply, response.usage.output_tokens);
    if (corruption) {
      return {
        ok: false,
        error: `Discarded a malformed reply: ${corruption}`,
        retryable: true,
        regenerate: true,
      };
    }
    if (reply.length > MAX_SMS_LENGTH) {
      // Refused rather than truncated: cutting a message mid-sentence sends a
      // lead something that reads as broken. Worth another attempt — an
      // over-long reply is usually a one-off, not a property of the thread.
      return {
        ok: false,
        error: `Reply is ${reply.length} characters, over the ${MAX_SMS_LENGTH} SMS limit`,
        retryable: false,
        regenerate: true,
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
    // Transport and API failures are the SDK's to retry; regenerating here
    // would stack another round of attempts on top of the ones it already made.
    return { ok: false, ...described, regenerate: false };
  }
}
