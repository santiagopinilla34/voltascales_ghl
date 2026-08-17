import { NextResponse, type NextRequest } from "next/server";

import { runMonthlyBilling } from "@/lib/billing/monthly";
import { cronSecret } from "@/lib/env";

/**
 * Monthly number rent and auto-recharge.
 *
 * Same contract as `/api/cron/booking-reminders`: Vercel Cron attaches
 * `Authorization: Bearer $CRON_SECRET`, so the secret is both the
 * configuration and the authentication, and the route refuses to run without
 * one. This endpoint moves money on every client account, which makes an
 * unauthenticated version of it considerably worse than that one.
 *
 * Scheduled daily even though the work is monthly — everything it writes is
 * keyed on the calendar month, so the second run of a month is a no-op. See
 * `lib/billing/monthly.ts` for why that is the right shape.
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = cronSecret();

  if (!secret) {
    console.error(
      "[billing] refusing to run: CRON_SECRET is not set, so this endpoint is unauthenticated",
    );
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  try {
    const reports = await runMonthlyBilling();

    for (const report of reports) {
      // Only accounts where something happened. A line a day per silent client
      // would bury the ones that matter.
      if (report.recharged || report.rentalsCharged || report.errors.length) {
        console.log(
          `[billing] ${report.orgName}: recharged=${report.recharged} ` +
            `rentals=${report.rentalsCharged}` +
            (report.errors.length ? ` errors=${report.errors.join("; ")}` : ""),
        );
      }
    }

    return NextResponse.json({
      accounts: reports.length,
      recharged: reports.filter((report) => report.recharged > 0).length,
      rentalsCharged: reports.reduce((sum, report) => sum + report.rentalsCharged, 0),
      errors: reports.flatMap((report) => report.errors),
    });
  } catch (error) {
    console.error("[billing] run failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown failure" },
      { status: 500 },
    );
  }
}
