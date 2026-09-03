/**
 * Turns a results directory into the table the decision is actually made from.
 *
 *   npx tsx evals/report.mts evals/results/2026-09-03T12-00-00
 *
 * ## Why not a single pass rate
 *
 * Half the handoff cases expect `true` and half expect `false`, so accuracy
 * alone hides the trade every model makes between them. A bot that hands off
 * everything scores 50% and is useless; so does one that hands off nothing, and
 * the two failures could not be less alike. Recall (of the cases that needed a
 * person, how many got one) and specificity (of the ones that did not, how many
 * were left alone) name them separately.
 *
 * The same split applies to booking: "booked when it should" and "refused when
 * it should" are different capabilities and a single number lets one hide
 * behind the other.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { CASES } from "./cases";

type Row = {
  case: string;
  kind: "handoff" | "booking";
  model: string;
  rep: number;
  pass: boolean;
  expected: string;
  actual: string;
  costUsd: number;
  ms: number;
  turns: number;
  toolsUsed: string[];
};

const dir = process.argv[2];
if (!dir) {
  console.error("usage: report.mts <results-dir>");
  process.exit(1);
}

const rows: Row[] = readFileSync(join(dir, "results.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Row);

const errorsPath = join(dir, "errors.jsonl");
const errors = existsSync(errorsPath)
  ? readFileSync(errorsPath, "utf8").trim().split("\n").filter(Boolean)
  : [];

const expectations = new Map(
  CASES.map((c) => [
    c.id,
    c.kind === "handoff" ? c.needsHuman : c.shouldBook,
  ]),
);

/**
 * Wilson score interval, not mean ± 1.96·SE.
 *
 * At the sample sizes an eval like this runs — 5 reps over 6 cases is 30
 * attempts — the normal approximation misbehaves badly near 0 and 1, and near
 * 0 and 1 is exactly where these results live. Wilson stays inside [0, 1] and
 * does not claim a zero-width interval for a perfect score.
 */
function wilson(passes: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.96;
  const p = passes / total;
  const denom = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const spread =
    z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return [
    Math.max(0, (centre - spread) / denom),
    Math.min(1, (centre + spread) / denom),
  ];
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

const models = [...new Set(rows.map((r) => r.model))];

console.log(`\n${rows.length} scored attempts, ${errors.length} errors\n`);

for (const model of models) {
  const mine = rows.filter((r) => r.model === model);

  const positives = mine.filter((r) => expectations.get(r.case) === true);
  const negatives = mine.filter((r) => expectations.get(r.case) === false);

  const handoff = mine.filter((r) => r.kind === "handoff");
  const booking = mine.filter((r) => r.kind === "booking");

  const passes = mine.filter((r) => r.pass).length;
  const [lo, hi] = wilson(passes, mine.length);

  const cost = mine.reduce((sum, r) => sum + r.costUsd, 0) / mine.length;
  const latencies = mine.map((r) => r.ms).sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const worst = latencies.at(-1) ?? 0;

  // Turns to book, over the bookings that actually happened. The number that
  // separated Luna before and after the prompt fix.
  const booked = booking.filter((r) => r.toolsUsed.includes("book_appointment"));
  const avgTurns = booked.length
    ? (booked.reduce((s, r) => s + r.turns, 0) / booked.length).toFixed(1)
    : "—";

  console.log(`── ${model}`);
  console.log(
    `   overall      ${pct(passes / mine.length)}  (${passes}/${mine.length}, 95% CI ${pct(lo)}–${pct(hi)})`,
  );
  console.log(
    `   recall       ${pct(positives.filter((r) => r.pass).length / (positives.length || 1))}  ` +
      `— of the cases that needed a person / a booking, how many got one`,
  );
  console.log(
    `   specificity  ${pct(negatives.filter((r) => r.pass).length / (negatives.length || 1))}  ` +
      `— of the ones that did not, how many were left alone`,
  );
  console.log(
    `   handoff      ${pct(handoff.filter((r) => r.pass).length / (handoff.length || 1))}   ` +
      `booking ${pct(booking.filter((r) => r.pass).length / (booking.length || 1))}`,
  );
  console.log(
    `   $${cost.toFixed(5)}/conversation   ${(median / 1000).toFixed(1)}s median, ${(worst / 1000).toFixed(1)}s worst   ${avgTurns} turns to book`,
  );

  // Any case that is not unanimous across reps is the interesting one: it is
  // either a genuinely marginal case or a flaky model, and both are worth a
  // look before trusting the headline.
  const flaky = [...new Set(mine.map((r) => r.case))].filter((id) => {
    const reps = mine.filter((r) => r.case === id);
    return reps.some((r) => r.pass) && reps.some((r) => !r.pass);
  });
  if (flaky.length) console.log(`   inconsistent: ${flaky.join(", ")}`);

  const failed = [...new Set(mine.filter((r) => !r.pass).map((r) => r.case))];
  if (failed.length) console.log(`   failed:       ${failed.join(", ")}`);
  console.log();
}

if (errors.length) {
  console.log("Errors (not scored, not averaged in):");
  for (const line of errors) {
    const e = JSON.parse(line);
    console.log(`  ${e.case}/${e.model}/r${e.rep} ${e.class}: ${e.detail}`);
  }
}
