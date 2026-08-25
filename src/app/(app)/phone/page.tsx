import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { BuyNumberDialog } from "@/components/phone/buy-number-dialog";
import { NoNumber } from "@/components/phone/no-number";
import { NumbersPanel } from "@/components/phone/numbers-panel";
import { Badge } from "@/components/ui/badge";
import { requireOrgContext } from "@/lib/orgs/context";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW_OWNED, type OwnedNumber } from "@/lib/phone/numbers";
import { getA2pProfile } from "@/lib/phone/profile";
import { listOwnedNumbers } from "@/lib/twilio/numbers";
import { twilioScopeFor } from "@/lib/twilio/scope";

export const metadata: Metadata = { title: "Phone System · VoltaScales" };

/**
 * Phone System, for whichever organization is being viewed.
 *
 * The owned list is live from Twilio. Roles — which number is the main line,
 * which one booking alerts go to — are not something Twilio knows, so they are
 * matched on afterwards from the app's own configuration.
 *
 * Which Twilio account is asked used to be a constant: the one in the
 * environment, i.e. the agency's. That is why a client signing in found the
 * agency's numbers here under the heading "Your numbers". `twilioScopeFor`
 * answers it per organization now, and answers "nobody" for a client with no
 * subaccount — which is every client until one is provisioned, and the reason
 * the empty state below exists rather than a borrowed list.
 *
 * Preview data survives only as the fallback for an account Twilio cannot be
 * reached for, and says so on screen.
 */

// The number list is the point of the page and it changes when you buy one;
// a cached list would show a number you just released.
export const dynamic = "force-dynamic";

export default async function PhonePage() {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const [settings, a2p, scope] = await Promise.all([
    getSettings(supabase),
    getA2pProfile(supabase),
    twilioScopeFor(context.orgId),
  ]);

  // Named for the agency, neutral for a client — the same rule the rest of the
  // phone screens follow through `useVendor`, applied here on the server
  // because this is not a client component and has the context in hand.
  const vendorName = context.isPlatformAdmin ? "Twilio" : "the phone network";

  if (!scope.provisioned) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Header count={null} showBuy={false} />

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10">
          <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-8 pb-6">
            {scope.error ? (
              // Not the buy-a-number empty state: this account may well have a
              // number and we simply could not find out. Telling someone to
              // buy one here is how they end up paying for two.
              <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Could not work out which account this belongs to, so nothing
                  is shown rather than the wrong thing: {scope.error}
                </span>
              </p>
            ) : (
              // A client may buy their own first number — that is what
              // provisions their account and what the balance then pays for.
              // The agency reaching this state is looking at a client whose
              // account is not set up, and buying on their behalf is the same
              // action, so both get the button.
              <NoNumber canBuy />
            )}
          </div>
        </div>
      </div>
    );
  }

  const owned = await listOwnedNumbers(scope.client);

  const bookingNotify = settings?.booking_notify_number?.trim() || null;
  // Read out before the closure: a hoisted function declaration does not keep
  // the narrowing the early return above established.
  const mainNumber = scope.mainNumber;

  /** What this app uses a number for, which is not something Twilio records. */
  function roleOf(phoneNumber: string): string | null {
    if (mainNumber && phoneNumber === mainNumber) return "Main line";
    if (phoneNumber === bookingNotify) return "Booking alerts";
    return null;
  }

  const usingPreview = !owned.ok;
  const numbers: OwnedNumber[] = owned.ok
    ? owned.value.map((entry) => ({ ...entry, role: roleOf(entry.phoneNumber) }))
    : PREVIEW_OWNED;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header count={numbers.length} showBuy />

      {/* Wider than the other pages. Six columns of number metadata do not fit
          in the 3xl the text-heavy pages use — at that width the role badge
          overlapped the number and the A2P cell had no room for its button. */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-8 pb-6">
          {usingPreview && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Could not reach {vendorName}, so the numbers below are examples
                rather than yours: {owned.ok ? "" : owned.error}
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

/**
 * The count is hidden rather than shown as zero when there is no account to
 * count against. "0" next to the title reads as "you have no numbers", which
 * is true but suggests the list below is a list; there is no list.
 */
function Header({ count, showBuy }: { count: number | null; showBuy: boolean }) {
  return (
    <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1400px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            Phone System
          </h1>
          {count !== null && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {count}
            </span>
          )}
        </div>
        {showBuy && <BuyNumberDialog />}
        </div>
      </header>
  );
}
