import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PauseCircle } from "lucide-react";

import { signOut } from "@/app/(app)/actions";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getOrgContext } from "@/lib/orgs/context";

export const metadata: Metadata = { title: "Account paused · VoltaScales" };

// The status can change while someone is sitting on this page, and the whole
// point is that it stops being true the moment they pay.
export const dynamic = "force-dynamic";

/**
 * Where a suspended client lands.
 *
 * Deliberately outside the `(app)` group, so it renders without the sidebar,
 * the top bar or any of the pages behind them — a client whose account is
 * paused should not be looking at a shell full of links that will bounce them
 * back here.
 *
 * The wording avoids accusing anyone. Suspension is usually non-payment, but it
 * is also what you would use for a billing mix-up or a card that expired, and
 * a page that says "you did not pay" to someone whose bank declined a renewal
 * is a page that costs you the client.
 *
 * Anyone whose account is *not* suspended is sent back to the app, so this
 * cannot be reached by typing the URL out of curiosity.
 */
export default async function SuspendedPage() {
  const context = await getOrgContext();

  if (!context) redirect("/login");
  if (context.isPlatformAdmin || context.orgStatus !== "suspended") {
    redirect("/inbox");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <Logo className="h-7 self-start" />

      <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <div className="flex items-center gap-2">
          <PauseCircle className="size-5 shrink-0" />
          <h1 className="text-base font-semibold tracking-tight">
            Services paused
          </h1>
        </div>

        <p className="text-sm opacity-90">
          Access to <strong>{context.orgName}</strong> is paused while the
          account is settled. This is a billing hold, not a closure.
        </p>

        <p className="text-sm opacity-90">
          Nothing has been deleted. Your contacts, conversations, bookings and
          invoices are all exactly where you left them, and everything comes
          back the moment payment is confirmed.
        </p>

        <p className="text-sm opacity-90">
          If you have already paid, or you think this is a mistake, reply to
          your last invoice and it will be sorted out.
        </p>
      </div>

      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </main>
  );
}
