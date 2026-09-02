import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * What the Payments page shows while Stripe is being read.
 *
 * ## Why this file exists
 *
 * The page is `force-dynamic` and waits on four calls to Stripe — account,
 * balance, charges, payouts — plus the payment links and the package list.
 * They run in parallel, but the page still cannot render until the slowest
 * lands, and Stripe from a cold function is not fast. Without a Suspense
 * boundary the router holds the *previous* screen in place for all of it, so
 * clicking Payments in the sidebar did nothing at all for a second or two and
 * the app appeared to have ignored the click.
 *
 * `loading.tsx` is that boundary. Next swaps this in the instant the link is
 * pressed, and the sidebar — which lives in the layout, not here — stays
 * interactive throughout.
 *
 * ## Why the shapes, and not a spinner
 *
 * A bare spinner on an empty page says "wait" and nothing else, and when the
 * real page arrives every element lands at once from nowhere. Blocks in the
 * shape of what is coming hold the layout still, so the balance figures and
 * the tables appear where their placeholders already were.
 *
 * They are deliberately not readable — no fake numbers, no invented
 * currency. This is the one page in the app where a plausible-looking figure
 * would be somebody's revenue, and a placeholder that could be mistaken for
 * data is worse here than anywhere else.
 */

/** Enough rows to fill the panel without pretending to know how many there
 *  are. Irregular widths, so it reads as content rather than as a loading bar. */
const PAYOUT_ROWS = ["w-24", "w-20", "w-28"];
const CHARGE_ROWS = ["w-44", "w-36", "w-52", "w-40", "w-32"];

/** Spacing between each block's pulse. In unison they read as one thing
 *  flashing; staggered, as a surface with something behind it. */
const PULSE_STAGGER_MS = 80;

export default function PaymentsLoading() {
  return (
    <div className="loading-enter flex min-h-0 flex-1 flex-col">
      {/* Same height and border as the real header, so the page does not shift
          by a pixel when Stripe answers. */}
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1400px] items-center gap-3">
          <h1 className="truncate text-sm font-semibold tracking-tight">Payments</h1>
          <span
            role="status"
            className="text-muted-foreground flex items-center gap-1.5 text-xs"
          >
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Reading Stripe…
          </span>
        </div>
      </header>

      <div
        aria-hidden
        className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10"
      >
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-6 pb-6">
          {/* The connection bar: which account this is, and how to stop. */}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52" style={delay(1)} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="h-8 w-28 rounded-md" style={delay(2)} />
              <Skeleton className="h-8 w-24 rounded-md" style={delay(3)} />
            </div>
          </div>

          {/* The same two-column split the dashboard uses from `xl` up: the
              account's own position on the left, the traffic that produced it
              on the right. */}
          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {["Available", "Pending"].map((panel, index) => (
                  <div
                    key={panel}
                    className="flex min-w-0 flex-col gap-2 rounded-lg border p-4"
                  >
                    {/* The tall one: a balance is set in 3xl type and is by far
                        the biggest thing that moves when the real page lands. */}
                    <Skeleton className="h-9 w-36" style={delay(index)} />
                    <Skeleton className="h-4 w-20" style={delay(index + 1)} />
                    <Skeleton className="h-3 w-32" style={delay(index + 2)} />
                  </div>
                ))}
              </div>

              <Section rows={PAYOUT_ROWS} />
            </div>

            <Section rows={CHARGE_ROWS} />
          </div>

          {/* Payment links. */}
          <div className="flex min-w-0 flex-col gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-64" style={delay(1)} />
            <Skeleton className="h-24 w-full rounded-lg" style={delay(2)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ rows }: { rows: string[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-4 w-44" />
      <Skeleton className="h-3 w-56" style={delay(1)} />

      <div className="min-w-0 overflow-hidden rounded-lg border">
        {rows.map((width, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <Skeleton className={`h-3.5 ${width}`} style={delay(index)} />
              <Skeleton className="h-3 w-24" style={delay(index + 1)} />
            </div>
            <Skeleton className="h-3.5 w-16 shrink-0" style={delay(index + 2)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function delay(step: number): React.CSSProperties {
  return { animationDelay: `${step * PULSE_STAGGER_MS}ms` };
}
