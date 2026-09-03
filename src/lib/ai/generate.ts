import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env";
import type { AiModel, AnthropicModel } from "@/types/database";

import type { AgentTools } from "./booking-tools";
import {
  MAX_RETRIES,
  MAX_SMS_LENGTH,
  MAX_TOKENS,
  MAX_TOOL_ROUNDS,
  OUTPUT_SCHEMA,
  REQUEST_TIMEOUT_MS,
  type Attempt,
  type AiReplyResult,
} from "./contract";
import { attemptOpenAiGeneration } from "./generate-openai";
import { looksCorrupted } from "./integrity";
import type { ConversationTurn } from "./prompt";

/**
 * The Claude call behind the SMS chatbot (PRD 5), and the front door for every
 * other provider.
 *
 * Generates only. Nothing in this module talks to Twilio or writes to the
 * database — deciding whether a generated reply is allowed to be sent is the
 * caller's job, and keeping that decision out of here means there is exactly
 * one place to audit it.
 *
 * `generateAiReply` is provider-agnostic: it owns the retry policy and the
 * side-effect veto, then hands one attempt to whichever module speaks the
 * chosen model's API. Everything below that function is the Anthropic
 * implementation; OpenAI's lives in `generate-openai.ts`. The retry rules stay
 * here rather than being duplicated because they are the part that, done twice
 * and slightly differently, books somebody two meetings.
 */

/** Re-exported so callers keep importing the result type from here. */
export type { AiReplyResult };

/**
 * Per-model request shaping.
 *
 * `effort` is rejected outright by Haiku 4.5, so it cannot be sent
 * unconditionally. Encoded as data rather than discovered at runtime, because
 * the failure mode is a 400 in the middle of a live conversation.
 *
 * Thinking is off everywhere — see THINKING below.
 */
const MODEL_SUPPORTS_EFFORT: Record<AnthropicModel, boolean> = {
  "claude-sonnet-5": true,
  "claude-opus-4-8": true,
  // Older generation: `effort` errors on this model.
  "claude-haiku-4-5-20251001": false,
};

/**
 * Thinking, per model. Was off everywhere; tools are why it is back on.
 *
 * The case for turning it off was sound and was made for a generator that only
 * ever wrote a sentence: a corrupted draft in testing correlated with the one
 * heavy-thinking generation, thinking tokens made `outputTokens` useless as an
 * integrity signal, and a 6-case handoff test scored 6/6 with it off against
 * 5/6 with it on. None of that argued for thinking; it argued that there was no
 * accuracy to protect.
 *
 * Giving the model tools changed what is being protected. A thinking-off model
 * will occasionally write a tool call into its **visible text** instead of
 * emitting a `tool_use` block: the turn succeeds, the call never runs, nothing
 * raises, and in a loop that text goes back into the next request. For this app
 * that is a bot telling somebody their meeting is booked when nothing was
 * written. A silent wrong answer beats a measurable one, so thinking is on and
 * the token heuristic is the thing that gives way — see `integrity.ts`, where
 * the ratio check now only runs on turns the model did not think, and a new
 * check looks for exactly the leakage described above.
 *
 * Encoded as data for the same reason `MODEL_SUPPORTS_EFFORT` is: each of the
 * three models accepts a *different* shape and rejects the other two with a
 * 400, which would be a 400 in the middle of a live conversation. Verified
 * against the API on 2026-09-01:
 *
 * - `claude-sonnet-5` — adaptive only; `enabled`/`budget_tokens` is a 400.
 * - `claude-opus-4-8` — adaptive only; `enabled`/`budget_tokens` is a 400.
 * - `claude-haiku-4-5-20251001` — older generation: adaptive is a 400, and a
 *   `budget_tokens` budget is the only way to have thinking at all.
 *
 * `display` is left at its default, which omits the reasoning text. Nothing
 * here reads it — `integrity.ts` only asks *whether* the model thought, which
 * the presence of a `thinking` block answers on its own — and asking for
 * summaries would be output tokens spent on something nobody looks at.
 */
const THINKING: Record<AnthropicModel, Anthropic.ThinkingConfigParam> = {
  "claude-sonnet-5": { type: "adaptive" },
  "claude-opus-4-8": { type: "adaptive" },
  // The minimum the API accepts, and more than one text message needs. It has
  // to stay below MAX_TOKENS, which it comfortably does.
  "claude-haiku-4-5-20251001": { type: "enabled", budget_tokens: 1024 },
};

/**
 * A 400 that means "ask again", not "your request is wrong".
 *
 * Replaying a `thinking` block to `claude-haiku-4-5-20251001` is rejected
 * roughly a quarter of the time with a 400 whose entire message is "Invalid
 * request data" — no field, no detail. It is **not** the request body. The same
 * bytes sent five times in a row returned 400, 200, 200, 200, 200, and swapping
 * a request that failed for one that had just succeeded reversed which one
 * failed. Measured over 12 identical requests per arm on 2026-09-03:
 *
 * - thinking on, block replayed  → 4/12 rejected
 * - thinking on, block stripped  → 0/12
 * - thinking off, block stripped → 0/12
 *
 * So the trigger is the replayed thinking block, but the rejection is not
 * deterministic and nothing we could send instead would prevent it. (`caller`
 * on the `tool_use` block, the cache breakpoint and `output_config` were each
 * ruled out the same way.) It failed 10 of 30 Haiku booking attempts, and
 * because `describeError` classes a 400 as non-retryable it abandoned the whole
 * reply — a bot going silent mid-booking, having already told the lead it was
 * looking up times.
 *
 * Stripping the thinking blocks also clears it, and was tried first, but that
 * is a real cost: it drops the record of the model's own reasoning across
 * turns, and `book-first-name-only` — the case that turns on remembering a
 * decision made earlier in the conversation — fell from 9/9 to 3/5 with it on.
 * Retrying keeps what Anthropic's guidance says to send and pays a second
 * request on the rare rejection instead.
 *
 * Deliberately narrow. A genuinely malformed request reports this same generic
 * message, so it will burn the retries and then fail exactly as before — a
 * bounded cost, and 400s are not billed.
 */
const TRANSIENT_BAD_REQUEST = /Invalid request data/i;

/** Attempts per request, not per reply. Three takes ~25% down to under 2%. */
const BAD_REQUEST_ATTEMPTS = 3;

/**
 * `messages.create`, retrying only the flake described on
 * `TRANSIENT_BAD_REQUEST`. Every other error is raised on the first try — the
 * SDK's own `maxRetries` already covers 429s and 5xx, and it does not retry
 * 400s at all, which is right for every 400 but this one.
 */
async function createWithRetry(
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  let last: unknown;

  for (let attempt = 1; attempt <= BAD_REQUEST_ATTEMPTS; attempt++) {
    try {
      return await client().messages.create(params);
    } catch (error) {
      const transient =
        error instanceof Anthropic.BadRequestError &&
        TRANSIENT_BAD_REQUEST.test(error.message);
      if (!transient) throw error;

      last = error;
      console.warn(
        `[ai] transient 400 from ${params.model}, attempt ${attempt}/${BAD_REQUEST_ATTEMPTS}`,
      );
    }
  }

  throw last;
}

/**
 * Whether this module is the one that should answer.
 *
 * Keyed off `THINKING` rather than off the model id's prefix or a second list,
 * because `THINKING` is already required to name every Anthropic model — so the
 * check cannot drift from the table it is guarding. Adding a Claude model
 * without a thinking shape fails to compile; adding one and forgetting to teach
 * this function about it is not possible.
 */
function isAnthropicModel(model: AiModel): model is AnthropicModel {
  return model in THINKING;
}

/** Reply sanity checks live in `integrity.ts`, kept pure so they're testable. */

/**
 * The output schema, the SMS limit and the tool-round cap now live in
 * `contract.ts` — both providers answer to them, and a rule that applied to
 * only one of them would be a rule with a hole in it.
 */

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
    return {
      error: "ANTHROPIC_API_KEY is missing or invalid",
      retryable: false,
    };
  }
  if (error instanceof Anthropic.NotFoundError) {
    return {
      error: "Model not found — check settings.ai_model",
      retryable: false,
    };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { error: `Rejected by the API: ${error.message}`, retryable: false };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { error: "Could not reach the Anthropic API", retryable: true };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      error: `API error ${error.status}: ${error.message}`,
      retryable: true,
    };
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
  cachePrompt,
  cacheKey,
  tools,
}: {
  systemPrompt: string;
  model: AiModel;
  conversation: ConversationTurn[];
  /**
   * Whether to spend a cache breakpoint on the system prompt.
   *
   * Off changes nothing the model sees — a cached prefix is the same tokens,
   * recomputed or not — so this is purely a bill, and the bet is that another
   * reply lands before the entry expires. A write costs about 1.25x a normal
   * read and a hit about a tenth, so a thread that carries on is much cheaper
   * and a single unanswered text is slightly dearer.
   */
  cachePrompt: boolean;
  /**
   * Which prompts should share a cache, for providers that pool rather than
   * mark. Ignored on the Anthropic path, which places its own breakpoint.
   *
   * The agent's id is the natural value: every conversation this agent has
   * opens with the identical prompt, and two agents share nothing worth
   * pooling. Optional so the preview routes can leave it out.
   */
  cacheKey?: string;
  /**
   * What the agent may do besides talk, or nothing.
   *
   * Absent means exactly the behaviour this function had before tools existed:
   * one request, one JSON reply. The caller decides what is connected — see
   * `bookingTools` — and a bot whose operator has configured nothing arrives
   * here with this undefined.
   *
   * Note the ordering consequence for caching: the API renders `tools` *before*
   * `system`, so the tool list is part of the cached prefix. It is built from
   * saved settings and is identical from one reply to the next, which is what
   * keeps that true.
   */
  tools?: AgentTools;
}): Promise<AiReplyResult> {
  if (conversation.length === 0) {
    return {
      ok: false,
      error: "Nothing from the contact to reply to",
      retryable: false,
    };
  }
  if (!systemPrompt.trim()) {
    // Without the business context the model would answer as a generic
    // assistant, which is worse than not answering.
    return {
      ok: false,
      error: "No AI system prompt is configured",
      retryable: false,
    };
  }

  // The integrity check below rejects a visibly damaged reply. That failure has
  // only ever been seen once in ~30 generations, so a single retry is very
  // likely to succeed — and retrying is far better than the alternatives, which
  // are sending a mangled text or going silent on a lead.
  //
  // With tools in play the retry acquired teeth it did not have as a text call:
  // a second attempt replays the whole turn from the top, so a first attempt
  // that booked a meeting and then produced a mangled sentence would book a
  // second one. The database refuses the *identical* slot twice, so the visible
  // failure would be an exclusion violation — but a retry that picks a
  // different time books twice for real. `sideEffects` is the answer: once
  // anything has been written, the reply stands as generated, however it reads.
  //
  // Which provider answers is decided here and nowhere else. Both return the
  // same `Attempt`, so everything below this line — the discard, the veto, the
  // logging — is identical whoever generated the reply.
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = isAnthropicModel(model)
      ? await attemptGeneration({
          systemPrompt,
          model,
          conversation,
          cachePrompt,
          tools,
        })
      : await attemptOpenAiGeneration({
          systemPrompt,
          model,
          conversation,
          cacheKey,
          tools,
        });

    if (result.ok || !result.regenerate) {
      return result.ok
        ? result
        : { ok: false, error: result.error, retryable: result.retryable };
    }

    if (result.sideEffects) {
      console.error(
        `[ai] keeping a bad generation because its tools already wrote something: ${result.error}`,
      );
      return { ok: false, error: result.error, retryable: false };
    }

    lastError = result.error;
    console.warn(`[ai] discarding attempt ${attempt}: ${result.error}`);
  }

  return { ok: false, error: lastError, retryable: true };
}

async function attemptGeneration({
  systemPrompt,
  model,
  conversation,
  cachePrompt,
  tools,
}: {
  systemPrompt: string;
  model: AnthropicModel;
  conversation: ConversationTurn[];
  cachePrompt: boolean;
  tools?: AgentTools;
}): Promise<Attempt> {
  // Grows as the model calls tools; the first request is the conversation
  // exactly as it arrived, which is what makes a bot with no tools byte
  // identical to how it behaved before this existed.
  const messages: Anthropic.MessageParam[] = [...conversation];
  const toolsUsed: string[] = [];
  let sideEffects = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let cacheWriteTokens = 0;

  try {
    for (let round = 0; ; round++) {
      // Withheld on the last round, deliberately. The model has to *answer*
      // eventually, and taking the tools away is how a loop that would have
      // gone round again is turned into a reply instead of a timeout.
      const offerTools =
        tools !== undefined &&
        tools.definitions.length > 0 &&
        round < MAX_TOOL_ROUNDS;

      const response = await createWithRetry({
        model,
        max_tokens: MAX_TOKENS,
        // Rendered before `system`, so this is the front of the cached prefix.
        // Built from saved settings and stable between replies — see the note
        // on the `tools` parameter above.
        ...(offerTools ? { tools: tools.definitions } : {}),
        // A string when caching is off; a single block carrying a cache
        // breakpoint when it is on. The breakpoint sits at the end of the system
        // prompt on purpose — everything before it is identical from one reply to
        // the next, and the conversation, which changes every turn, renders after
        // it and is never part of the cached prefix.
        system: cachePrompt
          ? [
              {
                type: "text" as const,
                text: systemPrompt,
                cache_control: { type: "ephemeral" as const },
              },
            ]
          : systemPrompt,
        messages,
        thinking: THINKING[model],
        output_config: {
          // Low effort keeps latency down for a reply that needs no
          // deliberation. Checked against the API with tools in play: on a
          // realistic prompt, low, medium and the default all called the tool
          // 4/4, so this is not costing the agent its tools.
          ...(MODEL_SUPPORTS_EFFORT[model] ? { effort: "low" as const } : {}),
          // Composes with tools rather than competing with them: a turn that
          // calls a tool returns `tool_use` blocks and skips the JSON, and the
          // turn that ends the loop emits it. Verified against the live API.
          format: { type: "json_schema" as const, schema: OUTPUT_SCHEMA },
        },
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      cachedTokens += response.usage.cache_read_input_tokens ?? 0;
      cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;

      if (response.stop_reason === "tool_use" && tools) {
        const calls = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
        );

        // `tool_use` with no tool blocks would loop forever on an identical
        // request. Falling through to the parse below turns it into one
        // ordinary "no text" failure rather than a hung webhook.
        if (calls.length === 0) {
          return {
            ok: false,
            error: "Model asked to use a tool and named none",
            retryable: true,
            regenerate: !sideEffects,
            sideEffects,
          };
        }

        // Echoed back so the next turn can see what it just did — minus any
        // empty text block.
        //
        // Found by the eval, not by a customer, which is the only reason it is
        // written down here rather than being a mystery in the logs. Claude
        // Haiku 4.5 sometimes emits `{type: "text", text: ""}` alongside its
        // `tool_use` blocks on a booking turn. Replaying that verbatim is a 400
        // on the *next* request — `messages: text content blocks must be
        // non-empty` — which `describeError` reports as non-retryable, so the
        // whole reply is abandoned. In production that is a bot that goes
        // silent halfway through booking a meeting, having already told the
        // lead it was looking up times. It failed 3 of 30 booking attempts on
        // Haiku before this line existed; the other 7 were the separate flake
        // that `TRANSIENT_BAD_REQUEST` covers.
        //
        // Dropping the block loses nothing: it carries no text, and thinking
        // and `tool_use` blocks pass through untouched — those the API does
        // require back exactly as they came.
        messages.push({
          role: "assistant",
          content: response.content.filter(
            (block) => block.type !== "text" || block.text.trim().length > 0,
          ),
        });

        // Sequentially, not in parallel. Two of these write to the same
        // calendar, and "find times" followed by "book" in one turn has to see
        // the effect of the first — and every result goes back in one user
        // message, because splitting them teaches the model to stop batching.
        const results: Anthropic.ToolResultBlockParam[] = [];

        for (const call of calls) {
          const outcome = await tools.run(call.name, call.input);
          toolsUsed.push(call.name);
          sideEffects ||= outcome.sideEffect;
          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: outcome.text,
          });
        }

        messages.push({ role: "user", content: results });
        continue;
      }

      return finish(response, {
        model,
        sideEffects,
        toolsUsed,
        // Every tool this generation was *offered*, not the ones it called.
        // The check is looking for a call that was written down instead of
        // made, so the tools it never got round to matter as much as the rest.
        toolNames: tools?.definitions.map((tool) => tool.name) ?? [],
        inputTokens,
        outputTokens,
        cachedTokens,
        cacheWriteTokens,
      });
    }
  } catch (error) {
    const described = describeError(error);
    console.error(`[ai] generation failed: ${described.error}`);
    // Transport and API failures are the SDK's to retry; regenerating here
    // would stack another round of attempts on top of the ones it already made.
    return { ok: false, ...described, regenerate: false, sideEffects };
  }
}

/** Turns the turn that stopped asking for tools into a result. */
function finish(
  response: Anthropic.Message,
  {
    model,
    sideEffects,
    toolsUsed,
    toolNames,
    inputTokens,
    outputTokens,
    cachedTokens,
    cacheWriteTokens,
  }: {
    model: AiModel;
    sideEffects: boolean;
    toolsUsed: string[];
    toolNames: string[];
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    cacheWriteTokens: number;
  },
): Attempt {
  if (response.stop_reason === "refusal") {
    return {
      ok: false,
      error: `Model declined to answer (${response.stop_details?.category ?? "unspecified"})`,
      retryable: false,
      regenerate: false,
      sideEffects,
    };
  }
  if (response.stop_reason === "max_tokens") {
    // The JSON is truncated, so there is nothing safe to parse.
    return {
      ok: false,
      error: "Reply hit the token limit",
      retryable: true,
      regenerate: false,
      sideEffects,
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
      sideEffects,
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
      sideEffects,
    };
  }

  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  if (!reply) {
    return {
      ok: false,
      error: "Model returned an empty reply",
      retryable: true,
      regenerate: true,
      sideEffects,
    };
  }

  // Against *this turn's* output tokens rather than the running total. The
  // check reads a reply's length against what it cost to produce, and folding a
  // booking's three round trips into that number would make every tool-using
  // reply look implausibly cheap for its size.
  const corruption = looksCorrupted(reply, response.usage.output_tokens, {
    // A `thinking` block is the only evidence available that the model
    // reasoned — the text is omitted by default and thinking tokens are not
    // broken out — and it is exactly the fact the ratio check needs.
    thought: response.content.some((block) => block.type === "thinking"),
    toolNames,
  });
  if (corruption) {
    return {
      ok: false,
      error: `Discarded a malformed reply: ${corruption}`,
      retryable: true,
      regenerate: true,
      sideEffects,
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
      sideEffects,
    };
  }

  return {
    ok: true,
    reply,
    // Anything other than an explicit false means hand it over — the safe
    // direction when the flag is missing is towards a human.
    needsHuman: parsed.needs_human !== false,
    model,
    servedModel: response.model,
    inputTokens,
    outputTokens,
    cachedTokens,
    cacheWriteTokens,
    toolsUsed,
    sideEffects,
  };
}
