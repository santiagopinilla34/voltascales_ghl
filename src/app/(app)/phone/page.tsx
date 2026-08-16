import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { BuyNumberDialog } from "@/components/phone/buy-number-dialog";
import { NumbersPanel } from "@/components/phone/numbers-panel";
import { Badge } from "@/components/ui/badge";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW_OWNED, type OwnedNumber } from "@/lib/phone/numbers";
import { getA2pProfile } from "@/lib/phone/profile";
import { listOwnedNumbers } from "@/lib/twilio/numbers";

export const metadata: Metadata = { title: "Phone System · VoltaScales" };

/**
 * Phone System.
 *
 * The owned list is live from Twilio. Roles — which number is the main line,
 * which one booking alerts go to — are not something Twilio knows, so they are
 * matched on afterwards from the app's own configuration.
 *
 * Preview data survives only as the fallback for an account Twilio cannot be
 * reached for, and says so on screen.
 */

// The number list is the point of the page and it changes when you buy one;
// a cached list would show a number you just released.
export const dynamic = "force-dynamic";

/** Reads the env var without the throwing accessor — unset is a valid state here. */
function configuredNumber(): string | null {
  const value = process.env.TWILIO_PHONE_NUMBER?.trim();
  return value || null;
}

export default async function PhonePage() {
  const supabase = await createClient();
  const [settings, owned, a2p] = await Promise.all([
    getSettings(supabase),
    listOwnedNumbers(),
    getA2pProfile(supabase),
  ]);

  const main = configuredNumber();
  const bookingNotify = settings?.booking_notify_number?.trim() || null;

  /** What this app uses a number for, which is not something Twilio records. */
  function roleOf(phoneNumber: string): string | null {
    if (phoneNumber === main) return "Main line";
    if (phoneNumber === bookingNotify) return "Booking alerts";
    return null;
  }

  const usingPreview = !owned.ok;
  const numbers: OwnedNumber[] = owned.ok
    ? owned.value.map((entry) => ({ ...entry, role: roleOf(entry.phoneNumber) }))
    : PREVIEW_OWNED;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            Phone System
          </h1>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {numbers.length}
          </span>
        </div>
        <BuyNumberDialog />
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-6 pb-4">
          {usingPreview && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Could not reach Twilio, so the numbers below are examples rather
                than yours: {owned.ok ? "" : owned.error}
              </span>
            </p>
          )}

          {usingPreview && (
            <Badge variant="outline" className="w-fit text-[10px]">
              Preview data
            </Badge>
          )}

          <NumbersPanel
            numbers={numbers}
            profile={a2p.profile}
            started={a2p.exists}
            submittedAt={a2p.submittedAt}
          />

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              What numbers cost
            </h2>
            <p className="text-muted-foreground text-xs">
              Rental is monthly and per number; calls and texts are billed on
              top, per minute and per segment. What you have actually spent is
              on{" "}
              <Link
                href="/usage"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Usage
              </Link>
              , which reads the real balance from Twilio.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
