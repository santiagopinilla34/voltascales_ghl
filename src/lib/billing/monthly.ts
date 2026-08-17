import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { twilioScopeFor } from "@/lib/twilio/scope";

import { credit, debit } from "./credit";
import { formatCredit, RATES } from "./rates";

/**
 * The monthly half of billing: rent on the numbers, and auto-recharge.
 *
 * Runs from `/api/cron/billing` once a day and is safe to run more often than
 * that. Both halves key their ledger entries on the calendar month, so a second
 * run in the same month writes nothing — which is what makes a daily schedule
 * viable for a monthly charge, and what makes a retried cron harmless.
 *
 * Daily rather than monthly on purpose. A once-a-month job that fails has to
 * wait a month to try again, or be re-run by hand at exactly the wrong moment;
 * a daily one that is idempotent per month simply catches up the next morning.
 *
 * ## Order matters
 *
 * Recharge first, then charge rent. Doing it the other way round would take a
 * client who is exactly covered and briefly overdraw them, which is visible on
 * the balance and, worse, would let the guards cut their number off for the few
 * seconds between the two writes.
 */

export type MonthlyReport = {
  orgId: string;
  orgName: string;
  recharged: number;
  rentalsCharged: number;
  errors: string[];
};

/** `2026-08`. The idempotency period for everything in this file. */
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function runMonthlyBilling(): Promise<MonthlyReport[]> {
  const admin = createAdminClient();

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, auto_recharge_cents")
    .eq("kind", "client");

  if (error) {
    console.error("[billing/monthly] could not list client accounts", error);
    return [];
  }

  const period = currentPeriod();
  const reports: MonthlyReport[] = [];

  // Sequential across accounts. There are tens of these, not thousands, and
  // each one makes a Twilio call — fanning them out would trade a job that
  // takes a few seconds for one that trips a rate limit.
  for (const org of orgs ?? []) {
    const report: MonthlyReport = {
      orgId: org.id,
      orgName: org.name,
      recharged: 0,
      rentalsCharged: 0,
      errors: [],
    };

    if (org.auto_recharge_cents) {
      const applied = await credit(org.id, {
        cents: org.auto_recharge_cents,
        kind: "topup",
        description: `Automatic top-up — ${formatCredit(org.auto_recharge_cents)}`,
        sourceKey: `auto:${period}`,
      });

      if (!applied.ok) report.errors.push(`auto-recharge: ${applied.error}`);
      else if (applied.applied) report.recharged = org.auto_recharge_cents;
    }

    // Rent is charged per number the account actually holds, read from their
    // own subaccount rather than from anything stored here. A number released
    // in Twilio's console last week should stop being billed this week, and
    // the only place that fact lives is Twilio.
    const scope = await twilioScopeFor(org.id);

    if (!scope.provisioned) {
      // Not an error. Most clients have no subaccount and therefore no numbers,
      // and nothing is owed on nothing.
      if (scope.error) report.errors.push(`account lookup: ${scope.error}`);
      reports.push(report);
      continue;
    }

    try {
      const numbers = await scope.client.incomingPhoneNumbers.list({ limit: 100 });

      for (const number of numbers) {
        const applied = await debit(org.id, {
          cents: RATES.numberMonthly,
          kind: "rental",
          description: `Number rental — ${number.phoneNumber}`,
          // The same shape the purchase writes, so the first month charged at
          // purchase and this month's renewal cannot both land for one number.
          sourceKey: `rental:${number.sid}:${period}`,
        });

        if (!applied.ok) report.errors.push(`rental ${number.phoneNumber}: ${applied.error}`);
        else if (applied.applied) report.rentalsCharged++;
      }
    } catch (twilioError) {
      report.errors.push(
        `numbers: ${twilioError instanceof Error ? twilioError.message : String(twilioError)}`,
      );
    }

    reports.push(report);
  }

  return reports;
}
