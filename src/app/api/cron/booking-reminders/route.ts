import { NextResponse, type NextRequest } from "next/server";

import { runAllReminders } from "@/lib/booking/reminders";
import { cronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Booking reminder job.
 *
 * Called by Vercel Cron on the schedule in `vercel.json`. Vercel attaches
 * `Authorization: Bearer $CRON_SECRET` to every scheduled request, so the
 * secret is both the configuration and the authentication.
 *
 * Fails closed when `CRON_SECRET` is unset. The endpoint can text every client
 * with a meeting in the next day, which makes an unprotected version of it a
 * way for a stranger to bill your Twilio account and wake your clients up —
 * the same reasoning that gates `/api/webhooks/form`.
 *
 * `GET` because that is what Vercel Cron issues. It is not cached: the route
 * reads `headers` and hits the database, both of which stop prerendering.
 */

/** Never fail a run because the previous one is still going. */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = cronSecret();

  if (!secret) {
    console.error(
      "[reminders] refusing to run: CRON_SECRET is not set, so this endpoint is unauthenticated",
    );
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    // No detail in the body. Someone probing this shouldn't learn whether they
    // got the header shape right.
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  try {
    const reports = await runAllReminders(createAdminClient());

    // One line per run in the Vercel logs, which is the only place anyone will
    // look when a client says they never got a reminder.
    console.log(
      `[reminders] ${reports
        .map((r) => `${r.kind}: ${r.sent} sent, ${r.failed} failed, ${r.skipped} skipped`)
        .join("; ")}`,
    );

    return NextResponse.json({ ok: true, reports });
  } catch (error) {
    console.error("[reminders] run failed", error);
    // A 500 is right here, unlike in the Twilio webhooks: nothing retries this
    // except the next scheduled run, and the status is what surfaces the
    // failure in Vercel's cron history.
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
}
