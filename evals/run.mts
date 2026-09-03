/**
 * Runs every case in `cases.ts` against each model and scores the results.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local evals/run.mts
 *   npx tsx ... evals/run.mts --models gpt-5.6-luna --reps 1 --dry
 *
 * ## What it drives
 *
 * The real path, not a copy of it: `getPrimaryBot` → `readBotKnowledge` →
 * `composeSystemPrompt` → `bookingTools` → `generateAiReply`, which is exactly
 * what `respondToInbound` does on the tail of a Twilio webhook. An eval that
 * rebuilt the prompt would measure a prompt nobody ships. The single deliberate
 * difference is `dryRun` on the tools: the reads are real, so the agent is
 * offered this account's genuinely open times, and the three writes come back
 * as "nothing happened" — a booking eval that books twenty meetings into a real
 * calendar is not an eval.
 *
 * ## What it records, and what it refuses to average
 *
 * Attempts that never produced a scorable reply — a timeout, a 429 that
 * outlasted its retries, a model that returned nothing — go to `errors.jsonl`
 * with a class, never to `results.jsonl`. This is the difference between "the
 * model got it wrong" and "the plumbing broke", and folding the second into the
 * first is how an eval reports a confident number pointing the wrong way.
 *
 * Every attempt also asserts that the model which *answered* is the model that
 * was asked for. A provider reroute or a capacity fallback would otherwise be
 * invisible, and a score served by the wrong model measures nothing.
 */
import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { composeSystemPrompt, readBotKnowledge } from "@/lib/ai-agents/prompt";
import type { ConversationBot } from "@/lib/ai-agents/bots";
import { getPrimaryBot } from "@/lib/ai-agents/queries";
import {
  bookingPromptSection,
  bookingTools,
  resolveBookingAbility,
  type BookingAbility,
} from "@/lib/ai/booking-tools";
import { generateAiReply } from "@/lib/ai/generate";
import type { ConversationTurn } from "@/lib/ai/prompt";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODEL_PRICES } from "@/lib/usage/pricing";
import type { AiModel, Contact, Database } from "@/types/database";

import { CASES, type EvalCase } from "./cases";

/** The three the comparison is actually about. Override with `--models`. */
const DEFAULT_MODELS: AiModel[] = [
  "gpt-5.6-luna",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-5",
];

/**
 * A single run is a point estimate with no error bar.
 *
 * The failures worth catching here are rare — the corruption bug behind
 * `integrity.ts` showed up once in about thirty generations — so a case that
 * passes once has said very little. Five is enough to separate "always" from
 * "usually" without making a full pass expensive.
 */
const DEFAULT_REPS = 5;

/** How many generations may be in flight. Well under either provider's limit. */
const CONCURRENCY = 4;

/**
 * Hard ceiling on one case, whatever the SDK is doing.
 *
 * `generateAiReply` already bounds a single request, but a booking case is up
 * to six tool rounds plus a retry, and a hung connection can keep a socket
 * alive indefinitely. When this fires the attempt is an error, never a zero.
 */
const CASE_TIMEOUT_MS = 240_000;

/** The contact the tools run against. Real row, so `list_my_appointments` works. */
const CONTACT_ID = "f74d6016-00f7-45d7-9f36-6c80d95f2aff";

type Args = {
  models: AiModel[];
  reps: number;
  dry: boolean;
  out: string;
  only: string | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : argv[i + 1];
  };

  const models = value("--models");
  const only = value("--cases");
  return {
    models: models ? (models.split(",") as AiModel[]) : DEFAULT_MODELS,
    // Substring match on the case id, for iterating on one family without
    // paying for the rest: `--cases book-` runs the six booking cases.
    only,
    reps: Number(value("--reps") ?? DEFAULT_REPS),
    // Prices the run and prints the plan without calling anything. Always the
    // first thing to do, because every real pass is real money.
    dry: argv.includes("--dry"),
    out: value("--out") ?? join("evals", "results", stamp()),
  };
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

type Row = {
  case: string;
  kind: EvalCase["kind"];
  model: string;
  servedModel: string;
  rep: number;
  pass: boolean;
  /** What was expected and what happened, in the case's own terms. */
  expected: string;
  actual: string;
  toolsUsed: string[];
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  ms: number;
};

type ErrorRow = {
  case: string;
  model: string;
  rep: number;
  class: "timeout" | "generation-failed" | "served-model-mismatch" | "crashed";
  detail: string;
};

/** List price for one attempt. Uses the same table the Usage page does. */
function costOf(model: string, row: { inputTokens: number; outputTokens: number; cachedTokens: number }): number {
  const price = MODEL_PRICES[model];
  if (!price) return 0;

  // Cached input at a tenth, matching both providers' published discount.
  return (
    (row.inputTokens / 1_000_000) * price.input +
    (row.cachedTokens / 1_000_000) * price.input * 0.1 +
    (row.outputTokens / 1_000_000) * price.output
  );
}

async function main() {
  const args = parseArgs();
  const supabase = createAdminClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", CONTACT_ID)
    .single();

  if (!contact) throw new Error(`No contact ${CONTACT_ID} to run tools against`);
  const orgId = (contact as Contact).org_id;

  const primaryBot = await getPrimaryBot(supabase, orgId);
  if (!primaryBot) throw new Error("No primary bot");
  // Re-bound so the narrowing survives into the worker closures below.
  const bot: ConversationBot = primaryBot;

  const settings = await getSettings(supabase, orgId);
  const ability = await resolveBookingAbility(supabase, bot, orgId);

  // Composed once and reused. It does not depend on the model, and rebuilding
  // it per attempt would let a knowledge-base edit mid-run change what half the
  // cases were asked.
  const systemPrompt = composeSystemPrompt({
    bot,
    knowledge: await readBotKnowledge(supabase, bot, orgId),
    businessName: settings?.business_name ?? "",
    contact: contact as Contact,
    booking: ability ? bookingPromptSection(ability) : null,
  });

  const cases = args.only
    ? CASES.filter((c) => c.id.includes(args.only!))
    : CASES;

  const attempts = args.models.flatMap((model) =>
    cases.flatMap((testCase) =>
      Array.from({ length: args.reps }, (_, rep) => ({ model, testCase, rep })),
    ),
  );

  console.log(
    `${cases.length} cases × ${args.models.length} models × ${args.reps} reps ` +
      `= ${attempts.length} conversations`,
  );
  console.log(`system prompt: ~${Math.round(systemPrompt.length / 4)} tokens`);
  console.log(`models: ${args.models.join(", ")}`);

  if (args.dry) {
    // A booking case is several turns and each turn is a full prompt, so the
    // estimate counts turns rather than cases.
    const turns = cases.reduce(
      (sum, c) => sum + (c.kind === "booking" ? c.turns.length : 1),
      0,
    );
    console.log(`\n~${turns * args.reps} generations per model. Rough cost:`);
    for (const model of args.models) {
      const price = MODEL_PRICES[model];
      if (!price) {
        console.log(`  ${model.padEnd(26)} no price on file`);
        continue;
      }
      // ~6k prompt (mostly cached after the first) and ~250 output per turn.
      const perTurn =
        (600 / 1_000_000) * price.input +
        (5400 / 1_000_000) * price.input * 0.1 +
        (250 / 1_000_000) * price.output;
      console.log(
        `  ${model.padEnd(26)} ~$${(perTurn * turns * args.reps).toFixed(3)}`,
      );
    }
    console.log("\nDry run — nothing was called. Drop --dry to run for real.");
    return;
  }

  mkdirSync(join(args.out, "traces"), { recursive: true });
  const resultsPath = join(args.out, "results.jsonl");
  const errorsPath = join(args.out, "errors.jsonl");

  let done = 0;
  const queue = [...attempts];

  async function worker() {
    for (;;) {
      const next = queue.shift();
      if (!next) return;

      const { model, testCase, rep } = next;
      const label = `${testCase.id}/${model}/r${rep}`;

      try {
        const outcome = await Promise.race([
          runCase({
            systemPrompt,
            model,
            testCase,
            rep,
            contact: contact as Contact,
            supabase,
            ability,
            bot,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`case exceeded ${CASE_TIMEOUT_MS}ms`)),
              CASE_TIMEOUT_MS,
            ),
          ),
        ]);

        if ("error" in outcome) {
          const row: ErrorRow = {
            case: testCase.id,
            model,
            rep,
            class: outcome.class,
            detail: outcome.error,
          };
          appendFileSync(errorsPath, JSON.stringify(row) + "\n");
          console.log(`  ${label} ERROR ${outcome.class}: ${outcome.error}`);
        } else {
          // Written as each attempt finishes: a crash halfway through a paid
          // run must not cost the cases that already completed.
          appendFileSync(resultsPath, JSON.stringify(outcome.row) + "\n");
          writeFileSync(
            join(args.out, "traces", `${testCase.id}_${model}_r${rep}.json`),
            JSON.stringify(outcome.trace, null, 2),
          );
          console.log(
            `  ${label} ${outcome.row.pass ? "pass" : "FAIL"} — ${outcome.row.actual}`,
          );
        }
      } catch (error) {
        const row: ErrorRow = {
          case: testCase.id,
          model,
          rep,
          class: /exceeded/.test(String(error)) ? "timeout" : "crashed",
          detail: error instanceof Error ? error.message : String(error),
        };
        appendFileSync(errorsPath, JSON.stringify(row) + "\n");
        console.log(`  ${label} ERROR ${row.class}: ${row.detail}`);
      }

      done += 1;
      if (done % 10 === 0) console.log(`[${done}/${attempts.length}]`);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, attempts.length) }, worker),
  );

  console.log(`\nWrote ${resultsPath}`);
  console.log(`Summarise with: npx tsx evals/report.mts ${args.out}`);
}

/**
 * One case, one model, one repetition.
 *
 * Returns a scored row or a classified error — never a zero standing in for a
 * failure that was not the model's.
 */
async function runCase({
  systemPrompt,
  model,
  testCase,
  rep,
  contact,
  supabase,
  ability,
  bot,
}: {
  systemPrompt: string;
  model: AiModel;
  testCase: EvalCase;
  rep: number;
  contact: Contact;
  supabase: SupabaseClient<Database>;
  ability: BookingAbility | null;
  bot: ConversationBot;
}): Promise<
  | { row: Row; trace: unknown }
  | { error: string; class: ErrorRow["class"] }
> {
  const turns: ConversationTurn[] = [];
  const customerTurns =
    testCase.kind === "handoff" ? [testCase.message] : testCase.turns;

  const started = Date.now();
  const transcript: { role: string; content: string; tools?: string[] }[] = [];

  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let toolsUsed: string[] = [];
  let needsHuman = false;
  let servedModel = "";

  for (const message of customerTurns) {
    turns.push({ role: "user", content: message });
    transcript.push({ role: "user", content: message });

    const result = await generateAiReply({
      systemPrompt,
      model,
      conversation: turns,
      cachePrompt: bot.settings.prompt_caching,
      cacheKey: bot.id,
      // dryRun: real availability, simulated writes. See the header.
      tools: ability
        ? (bookingTools(supabase, ability, {
            contact,
            dryRun: true,
          }) ?? undefined)
        : undefined,
    });

    if (!result.ok) {
      return { error: result.error, class: "generation-failed" };
    }

    // The one assertion that makes a cross-model number mean anything.
    // Providers resolve aliases to dated snapshots, so a served id that merely
    // extends the requested one is fine; anything else is a different model.
    if (!result.servedModel.startsWith(model.replace(/-\d{8}$/, ""))) {
      return {
        error: `asked for ${model}, served ${result.servedModel}`,
        class: "served-model-mismatch",
      };
    }

    servedModel = result.servedModel;
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    cachedTokens += result.cachedTokens;
    toolsUsed = [...toolsUsed, ...result.toolsUsed];
    needsHuman = result.needsHuman;

    turns.push({ role: "assistant", content: result.reply });
    transcript.push({
      role: "assistant",
      content: result.reply,
      tools: result.toolsUsed,
    });
  }

  const booked = toolsUsed.includes("book_appointment");

  const { pass, expected, actual } =
    testCase.kind === "handoff"
      ? {
          pass: needsHuman === testCase.needsHuman,
          expected: `needs_human=${testCase.needsHuman}`,
          actual: `needs_human=${needsHuman}`,
        }
      : {
          pass: booked === testCase.shouldBook,
          expected: `booked=${testCase.shouldBook}`,
          actual: `booked=${booked}`,
        };

  const usage = { inputTokens, outputTokens, cachedTokens };

  const row: Row = {
    case: testCase.id,
    kind: testCase.kind,
    model,
    servedModel,
    rep,
    pass,
    expected,
    actual,
    toolsUsed,
    turns: customerTurns.length,
    ...usage,
    costUsd: costOf(model, usage),
    ms: Date.now() - started,
  };

  return { row, trace: { case: testCase, model, transcript, row } };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
