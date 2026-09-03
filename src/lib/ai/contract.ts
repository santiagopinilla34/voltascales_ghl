import "server-only";

import type { AiModel } from "@/types/database";

/**
 * What every provider's generator must agree on.
 *
 * Extracted when OpenAI models joined the model picker. Before that, all of
 * this lived in `generate.ts` because there was only one implementation and
 * nothing to share it with; now two modules produce the same shape and the
 * caller — `respondToInbound`, the Test panel, the Inbox preview — must not be
 * able to tell which one answered.
 *
 * The values here are decisions about *this product*, not about any API: how
 * long an SMS may be, how many tool round trips a booking is allowed, what the
 * model must return. They are provider-independent on purpose. Anything that is
 * a fact about Anthropic or OpenAI belongs in that provider's own module.
 */

/** Twilio's hard limit; the system prompt asks for far shorter than this. */
export const MAX_SMS_LENGTH = 1600;

/**
 * Covers reasoning *and* the reply — both providers cap the two together, and a
 * tight budget truncates mid-sentence. Unused output tokens aren't billed, so
 * this is generous on purpose.
 */
export const MAX_TOKENS = 4000;

/**
 * Per attempt. Two attempts worst case, so ~60s of wall clock — comfortably
 * inside the function budget, and far below the point where a lead has given
 * up on getting an answer.
 */
export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_RETRIES = 1;

/**
 * How many times the model may call tools before the turn is cut short.
 *
 * Booking a meeting is three calls at most — find the times, look up their
 * existing appointments, write one — so this is generous. It exists because a
 * model that loops calling `find_available_times` forever would sit on the
 * webhook's tail until the function is torn down, and a lead would get silence.
 *
 * Hitting it is not an error: whatever the model has learned so far is kept and
 * it is asked, without tools, to answer with what it has.
 */
export const MAX_TOOL_ROUNDS = 6;

/**
 * The model's output contract.
 *
 * Structured rather than free text so the handover signal is machine-readable.
 * `needs_human` is what flips `ai_enabled` off, and PRD 5 calls that the single
 * most important rule in the app — far too important to detect by string
 * matching the reply.
 *
 * The system prompt is the operator's, sent verbatim; the shape is carried by
 * these descriptions rather than by appending instructions to their text.
 *
 * Both providers accept this same JSON Schema, and both are given it with
 * strict validation on. `additionalProperties: false` and a complete `required`
 * list are not stylistic here — OpenAI's structured outputs reject a schema
 * without them.
 */
export const OUTPUT_SCHEMA = {
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
      /** Summed across every turn, so a booking's tool round trips are billed
       *  and logged as the one reply they produced. */
      inputTokens: number;
      outputTokens: number;
      /**
       * Prefix served from the cache. Non-zero is a hit.
       *
       * Normalised across providers: Anthropic reports cached tokens *outside*
       * `input_tokens`, OpenAI reports them *inside* it. Both are stored here
       * the Anthropic way — `inputTokens` is what was paid for at full rate and
       * this is what was not — because `ai_drafts` and every cost figure
       * derived from it were built on that reading, and a number that means one
       * thing for half the rows is worse than no number.
       */
      cachedTokens: number;
      /** Prefix written to the cache. Billed at a premium by Anthropic, free on OpenAI. */
      cacheWriteTokens: number;
      /** Which tools ran, in order. Empty when the model just talked. */
      toolsUsed: string[];
    }
  | { ok: false; error: string; retryable: boolean };

/**
 * One pass at a generation, before the caller decides whether to try again.
 *
 * `regenerate` is the generator's opinion that another attempt could do better;
 * `sideEffects` is the veto on it. Once a tool has written something, a second
 * pass would replay the whole turn from the top and book a second meeting, so a
 * reply that reads badly stands as generated.
 */
export type Attempt =
  | (Extract<AiReplyResult, { ok: true }> & {
      regenerate?: false;
      sideEffects?: boolean;
    })
  | {
      ok: false;
      error: string;
      retryable: boolean;
      regenerate: boolean;
      /** Whether a tool in this attempt wrote something. Blocks the retry. */
      sideEffects: boolean;
    };
