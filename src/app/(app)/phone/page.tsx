import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";

import { BuyNumberDialog } from "@/components/phone/buy-number-dialog";
import { OwnedNumbers } from "@/components/phone/owned-numbers";
import { Badge } from "@/components/ui/badge";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW_OWNED, type OwnedNumber } from "@/lib/phone/numbers";
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
  const [settings, owned] = await Promise.all([
    getSettings(supabase),
    listOwnedNumbers(),
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

          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                Your numbers
              </h2>
              {usingPreview && (
                <Badge variant="outline" className="text-[10px]">
                  Preview data
                </Badge>
              )}
            </div>
            <OwnedNumbers numbers={numbers} />
          </section>

          <section className="flex min-w-0 flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Messaging compliance
              </h2>
              <p className="text-muted-foreground text-xs">
                US carriers reject application-to-person texts from unregistered
                numbers. This has to be done once per business, not per number.
              </p>
            </div>

            <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
              <div className="flex min-w-0 items-center gap-2">
                <ShieldCheck className="text-muted-foreground size-4 shrink-0" />
                <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
                  A2P 10DLC registration
                </h3>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  Not connected
                </Badge>
              </div>

              <p className="text-muted-foreground text-xs">
                Registering a brand and a campaign raises the throughput limit
                and stops carrier filtering. Toll-free numbers use a separate
                verification instead. Until this page can submit it, both are
                done in the Twilio console.
              </p>

              <Link
                href="https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline underline-offset-2"
              >
                Open A2P registration in Twilio
                <ExternalLink className="size-3" />
              </Link>
            </div>
          </section>

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
