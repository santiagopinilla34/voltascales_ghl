import "server-only";

import OpenAI from "openai";

import { serverEnv } from "@/lib/env";
import type { OpenAiModel } from "@/types/database";

import type { AgentTools } from "./booking-tools";
import {
  MAX_RETRIES,
  MAX_SMS_LENGTH,
  MAX_TOKENS,
  MAX_TOOL_ROUNDS,
  OUTPUT_SCHEMA,
  REQUEST_TIMEOUT_MS,
  type Attempt,
} from "./contract";
import { looksCorrupted } from "./integrity";
import type { ConversationTurn } from "./prompt";

/**
 * The OpenAI half of the SMS chatbot, behind the same contract as `generate.ts`.
 *
 * Built on the **Responses API** rather than Chat Completions. That is the
 * surface the 5.x models are designed around — reasoning items are first-class
 * there and are carried between turns, which is exactly what a tool loop needs.
 *
 * ## What is deliberately the same as the Anthropic path
 *
 * The output schema, the SMS length limit, the tool-round cap and the integrity
 * checks all come from `contract.ts` and are shared. A reply that would be
 * discarded coming from Claude is discarded coming from GPT, for the same
 * reason and with the same message. This matters more than it sounds: the
 * corruption guard and the tool-leakage guard in `integrity.ts` were written
 * against real failures, and a second provider that quietly skipped them would
 * be a second provider with no seatbelt.
 *
 * ## What is necessarily different
 *
 * - **Tools.** `booking-tools.ts` speaks Anthropic's tool shape, which is the
 *   right call — the booking logic is the delicate part and should not be
 *   rewritten for a second vendor. `toOpenAiTools` adapts the definitions at
 *   the boundary instead. There is one shape conversion and it is right here.
 *
 * - **Token accounting.** OpenAI counts cached tokens *inside* `input_tokens`;
 *   Anthropic counts them outside. `ai_drafts.input_tokens` and every cost
 *   figure built on it assume the Anthropic reading, so the subtraction below
 *   is not a tidy-up — without it a cached OpenAI reply looks ten times more
 *   expensive than it was.
 *
 * - **Caching is automatic.** There are no breakpoints to place. OpenAI caches
 *   any prefix over ~1024 tokens by itself, so the agent's `prompt_caching`
 *   toggle has nothing to switch on this path. `prompt_cache_key` is the one
 *   lever available and it is used below.
 */

/**
 * Effort, per model. Every model in the picker is a reasoning model and takes
 * this; the table exists so that adding a non-reasoning model later (a 4o-mini,
 * say) is a data change rather than a 400 in the middle of a live conversation.
 *
 * `low` for the same reason the Anthropic path uses it: an SMS reply needs no
 * deliberation, and reasoning tokens bill at the output rate.
 */
const MODEL_SUPPORTS_EFFORT: Record<OpenAiModel, boolean> = {
  "gpt-5.6-luna": true,
  "gpt-5.4-mini": true,
  "gpt-5.4-nano": true,
  "gpt-5-mini": true,
  "gpt-5-nano": true,
};

let cachedClient: OpenAI | null = null;

function client(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: serverEnv.openaiApiKey,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }
  return cachedClient;
}

/**
 * A JSON Schema the way OpenAI's structured tool calling insists on having it.
 *
 * The two vendors read `strict` differently, and the difference is not
 * cosmetic. Anthropic lets a strict tool have genuinely optional properties —
 * `find_available_times.from_day` is left out to mean "soonest available", and
 * `book_appointment.notes` is left out when there is nothing to note. OpenAI
 * rejects that outright:
 *
 *   400 Invalid schema for function 'find_available_times': 'required' is
 *   required to be supplied and to be an array including every key in
 *   properties. Missing 'from_day'.
 *
 * So an optional property is expressed the way OpenAI documents instead: listed
 * in `required`, with `null` added to its type. The model must now say
 * something about the field, and `null` is how it says "nothing".
 *
 * This is safe here because the tool runner already treats an absent value and
 * a useless one identically — `booking-tools`' `text()` helper turns anything
 * that is not a string into `""`, which is exactly what it did for `undefined`
 * before. Loosening `strict` to `false` instead would have been the smaller
 * diff and the worse trade: strict validation is what stops
 * `book_appointment` arriving without the email it claims to have.
 *
 * Recursive because JSON Schema is, even though every schema this app currently
 * passes is one level deep. A nested object added later should not have to
 * rediscover this.
 */
function toStrictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toStrictSchema);
  if (!schema || typeof schema !== "object") return schema;

  const node = { ...(schema as Record<string, unknown>) };
  const properties = node.properties as Record<string, unknown> | undefined;

  if (node.type === "object" && properties) {
    const keys = Object.keys(properties);
    const required = new Set(
      Array.isArray(node.required) ? (node.required as string[]) : [],
    );

    node.properties = Object.fromEntries(
      keys.map((key) => {
        const child = toStrictSchema(properties[key]) as Record<string, unknown>;
        if (required.has(key)) return [key, child];

        // Optional, so it has to become nullable to stay strict. Only widen a
        // plain string type — a property already declaring a union is left
        // alone rather than guessed at.
        return [
          key,
          typeof child.type === "string"
            ? { ...child, type: [child.type, "null"] }
            : child,
        ];
      }),
    );

    node.required = keys;
    return node;
  }

  return node;
}

/**
 * Anthropic tool definitions, in the shape the Responses API wants.
 *
 * Beyond the strictness rewrite above, this only moves `input_schema` to
 * `parameters` and flattens the wrapper — both vendors speak the same JSON
 * Schema dialect. `strict` is carried across rather than defaulted: it is what
 * makes `book_appointment` arrive with the fields it claims to have.
 */
function toOpenAiTools(
  definitions: AgentTools["definitions"],
): OpenAI.Responses.FunctionTool[] {
  return definitions.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description ?? null,
    parameters: toStrictSchema(tool.input_schema) as Record<string, unknown>,
    strict: tool.strict ?? true,
  }));
}

/**
 * Classifies a thrown SDK error, matching `describeError` in `generate.ts`.
 *
 * `retryable` describes the error, not a policy — the caller decides whether
 * anything is worth retrying.
 */
function describeError(error: unknown): { error: string; retryable: boolean } {
  if (error instanceof OpenAI.RateLimitError) {
    return { error: "Rate limited by the OpenAI API", retryable: true };
  }
  if (error instanceof OpenAI.AuthenticationError) {
    return { error: "OPENAI_API_KEY is missing or invalid", retryable: false };
  }
  if (error instanceof OpenAI.PermissionDeniedError) {
    return {
      error: "This OpenAI key is not allowed to use that model",
      retryable: false,
    };
  }
  if (error instanceof OpenAI.NotFoundError) {
    return {
      error: "Model not found — check the agent's model setting",
      retryable: false,
    };
  }
  if (error instanceof OpenAI.BadRequestError) {
    return { error: `Rejected by the API: ${error.message}`, retryable: false };
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return { error: "Could not reach the OpenAI API", retryable: true };
  }
  if (error instanceof OpenAI.APIError) {
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

export async function attemptOpenAiGeneration({
  systemPrompt,
  model,
  conversation,
  cacheKey,
  tools,
}: {
  systemPrompt: string;
  model: OpenAiModel;
  conversation: ConversationTurn[];
  /**
   * Groups requests that share a prefix so they land on the same cache.
   *
   * OpenAI routes by this rather than by an explicit breakpoint. The bot id is
   * the right granularity: every conversation this agent has starts with the
   * identical prompt, and two different agents share nothing worth pooling.
   */
  cacheKey: string | undefined;
  tools?: AgentTools;
}): Promise<Attempt> {
  // Grows as the model calls tools. Reasoning items come back in here too and
  // are passed forward unchanged — the 5.6 family renders them on later turns
  // by default, and dropping them mid-loop is how a model forgets why it called
  // the tool it just called.
  const input: OpenAI.Responses.ResponseInput = conversation.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const toolsUsed: string[] = [];
  let sideEffects = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let cacheWriteTokens = 0;
  let reasoned = false;

  try {
    for (let round = 0; ; round++) {
      // Withheld on the last round, deliberately — same reasoning as the
      // Anthropic path. The model has to *answer* eventually, and taking the
      // tools away turns a loop that would have gone round again into a reply.
      const offerTools =
        tools !== undefined &&
        tools.definitions.length > 0 &&
        round < MAX_TOOL_ROUNDS;

      const response = await client().responses.create({
        model,
        instructions: systemPrompt,
        input,
        ...(offerTools ? { tools: toOpenAiTools(tools.definitions) } : {}),
        text: {
          format: {
            type: "json_schema",
            name: "sms_reply",
            schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
            strict: true,
          },
          // The prompt already asks for a short answer; this is the same
          // instruction where the API can enforce it rather than request it.
          verbosity: "low",
        },
        ...(MODEL_SUPPORTS_EFFORT[model]
          ? { reasoning: { effort: "low" as const } }
          : {}),
        max_output_tokens: MAX_TOKENS,
        ...(cacheKey ? { prompt_cache_key: cacheKey } : {}),
        // Off on purpose. The Responses API otherwise keeps the conversation on
        // OpenAI's side for later retrieval, and these are customers' text
        // messages — nothing here ever reads a stored response back, so storing
        // them would be a copy of a CRM's inbox kept for no reason.
        store: false,
      });

      const usage = response.usage;
      if (usage) {
        const cached = usage.input_tokens_details?.cached_tokens ?? 0;
        // See the note at the top: OpenAI's `input_tokens` is the whole prompt,
        // cached part included. Subtracting keeps `inputTokens` meaning "paid
        // for at full rate", which is what it means on the Anthropic path and
        // what `ai_drafts` was built to hold.
        inputTokens += Math.max(0, usage.input_tokens - cached);
        cachedTokens += cached;
        cacheWriteTokens += usage.input_tokens_details?.cache_write_tokens ?? 0;
        outputTokens += usage.output_tokens;
        reasoned ||= (usage.output_tokens_details?.reasoning_tokens ?? 0) > 0;
      }

      const calls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
          item.type === "function_call",
      );

      if (calls.length > 0 && tools) {
        // Every output item this agent can actually produce, not just the
        // calls: the reasoning that led to them travels with them, and dropping
        // it is how a model forgets why it called the tool it just called.
        //
        // Filtered rather than spread wholesale because `output` is typed for
        // every tool OpenAI hosts — computer use, file search, web search — and
        // some of those come back in shapes the input array will not take. This
        // agent offers three function tools and nothing else, so these are the
        // three kinds that can appear; anything else would be a surprise worth
        // dropping rather than forwarding blind.
        for (const item of response.output) {
          if (
            item.type === "message" ||
            item.type === "reasoning" ||
            item.type === "function_call"
          ) {
            input.push(item);
          }
        }

        // Sequentially, not in parallel. Two of these write to the same
        // calendar, and "find times" followed by "book" in one turn has to see
        // the effect of the first.
        for (const call of calls) {
          let parsed: unknown = {};
          try {
            parsed = JSON.parse(call.arguments);
          } catch {
            // A malformed argument string is the tool's problem to answer, not
            // a reason to fail the whole reply. `booking-tools` treats a
            // non-object input as an empty one and says what it needs.
          }

          const outcome = await tools.run(call.name, parsed);
          toolsUsed.push(call.name);
          sideEffects ||= outcome.sideEffect;

          input.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: outcome.text,
          });
        }

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
        reasoned,
        inputTokens,
        outputTokens,
        cachedTokens,
        cacheWriteTokens,
      });
    }
  } catch (error) {
    const described = describeError(error);
    console.error(`[ai] openai generation failed: ${described.error}`);
    // Transport and API failures are the SDK's to retry; regenerating here
    // would stack another round of attempts on top of the ones it already made.
    return { ok: false, ...described, regenerate: false, sideEffects };
  }
}

/** Turns the turn that stopped asking for tools into a result. */
function finish(
  response: OpenAI.Responses.Response,
  {
    model,
    sideEffects,
    toolsUsed,
    toolNames,
    reasoned,
    inputTokens,
    outputTokens,
    cachedTokens,
    cacheWriteTokens,
  }: {
    model: OpenAiModel;
    sideEffects: boolean;
    toolsUsed: string[];
    toolNames: string[];
    reasoned: boolean;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    cacheWriteTokens: number;
  },
): Attempt {
  // A safety decline arrives as a refusal block inside the message rather than
  // as a thrown error, so it has to be looked for before the text is read.
  const refusal = response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .find((part) => part.type === "refusal");

  if (refusal) {
    return {
      ok: false,
      error: `Model declined to answer (${refusal.refusal})`,
      retryable: false,
      regenerate: false,
      sideEffects,
    };
  }

  if (response.status === "incomplete") {
    // The JSON is truncated, so there is nothing safe to parse.
    return {
      ok: false,
      error:
        response.incomplete_details?.reason === "max_output_tokens"
          ? "Reply hit the token limit"
          : `Reply came back incomplete (${response.incomplete_details?.reason ?? "unspecified"})`,
      retryable: true,
      regenerate: false,
      sideEffects,
    };
  }

  // The SDK's own concatenation of every output_text part — the equivalent of
  // joining the text blocks on the Anthropic side, and for the same reason:
  // taking the first of a split payload would parse a fragment as if it were
  // whole.
  const text = response.output_text;

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

  const corruption = looksCorrupted(reply, response.usage?.output_tokens ?? 0, {
    // Reasoning tokens are broken out here, unlike on the Anthropic side where
    // only the presence of a thinking block can be seen. Either way the ratio
    // check needs the same fact: did this turn spend output tokens on something
    // other than the reply.
    thought: reasoned,
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
    // lead something that reads as broken.
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
    inputTokens,
    outputTokens,
    cachedTokens,
    cacheWriteTokens,
    toolsUsed,
    sideEffects,
  };
}
