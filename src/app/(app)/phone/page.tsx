import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";

import { BuyNumberDialog } from "@/components/phone/buy-number-dialog";
import { OwnedNumbers } from "@/components/phone/owned-numbers";
import { Badge } from "@/components/ui/badge";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW_OWNED, type OwnedNumber } from "@/lib/phone/numbers";

export const metadata: Metadata = { title: "Phone System · VoltaScales" };

/**
 * Phone System (front end).
 *
 * The list of owned numbers is built from what the app is actually configured
 * with rather than from Twilio, because nothing here calls Twilio yet. That
 * keeps the one number the app really uses honest on screen; the invented
 * preview numbers only appear when there is no configuration at all, so a set
 * up account never sees a number it does not own.
 */

/** Reads the env var without the throwing accessor — unset is a valid state here. */
function configuredNumber(): string | null {
  const value = process.env.TWILIO_PHONE_NUMBER?.trim();
  return value || null;
}

export default async function PhonePage() {
  const supabase = await createClient();
  const settings = await getSettings(supabase);

  const main = configuredNumber();
  const bookingNotify = settings?.booking_notify_number?.trim() || null;

  const live: OwnedNumber[] = [];

  if (main) {
    live.push({
      sid: "",
      phoneNumber: main,
      friendlyName: "Configured as TWILIO_PHONE_NUMBER",
      // Unknowable without the API. Everything this app does with the number
      // needs both, and it works, so both are true.
      capabilities: { voice: true, sms: true, mms: false },
      monthlyCents: 115,
      role: "Main line",
      purchasedAt: null,
      webhooksConfigured: true,
    });
  }

  // The booking notification number is a real phone the operator owns, but it
  // is not rented from Twilio — it is where alerts are sent. Listed so the page
  // accounts for every number the app knows about.
  if (bookingNotify && bookingNotify !== main) {
    live.push({
      sid: "",
      phoneNumber: bookingNotify,
      friendlyName: "Where booking alerts are texted",
      capabilities: { voice: true, sms: true, mms: false },
      monthlyCents: 0,
      role: "Booking alerts",
      purchasedAt: null,
      webhooksConfigured: false,
    });
  }

  const usingPreview = live.length === 0;
  const numbers = usingPreview ? PREVIEW_OWNED : live;

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
          <p className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              This page is the front end only. Buying, releasing and configuring
              numbers are not connected to Twilio yet — the buttons say so when
              you press them.
            </span>
          </p>

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
            {usingPreview && (
              <p className="text-muted-foreground text-xs">
                No number is configured, so these are examples.
                Set <code>TWILIO_PHONE_NUMBER</code> and your real one appears
                here.
              </p>
            )}
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
