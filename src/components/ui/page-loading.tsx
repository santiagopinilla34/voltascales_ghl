import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The screen a page shows while its data is still being read.
 *
 * ## Why every page needs one
 *
 * Next holds the *previous* screen in place until the next one's data lands.
 * With no Suspense boundary that is the whole page: press Automations while on
 * Inbox and, for as long as the query takes, the app shows Inbox and appears to
 * have ignored the click. Half a second of that reads as a freeze, and the
 * honest fix is not a faster query — it is telling the router it may swap
 * immediately. A `loading.tsx` in a route segment is that boundary, and it
 * covers the segment's children too, so one file per section is enough.
 *
 * ## Why this is shared rather than bespoke per page
 *
 * Payments has a hand-built skeleton because its layout is unlike anything else
 * in the app. The rest are the same shell — a 14-unit header with the title on
 * the left, then a scrolling body capped at 1400px — and fifteen hand-written
 * copies of that shell would drift from it one page at a time. This takes the
 * title, a line saying what is being waited on, and the shape of the body.
 *
 * The shapes are deliberately unreadable: no fake names, no invented numbers,
 * nothing that could be mistaken for data that has actually arrived.
 */

/** Spacing between each block's pulse. In unison they read as one thing
 *  flashing; staggered, as a surface with something behind it. */
const PULSE_STAGGER_MS = 80;

function delay(step: number): React.CSSProperties {
  return { animationDelay: `${step * PULSE_STAGGER_MS}ms` };
}

/**
 * What the body of the page looks like.
 *
 * Four shapes cover every screen here. Picking the wrong one is not a bug —
 * it just means the placeholder moves when the real content lands — but
 * picking the right one is what makes the swap invisible.
 */
export type PageLoadingShape =
  | "list" // rows in a bordered panel: contacts, automations, invoices
  | "cards" // a grid of cards: agents, knowledge bases, domains
  | "form" // stacked fields: settings, business, email
  | "split"; // a sidebar and a pane: inbox, calendar settings

/** Irregular widths, so a row reads as content rather than as a loading bar. */
const ROW_WIDTHS = ["w-44", "w-32", "w-52", "w-36", "w-48", "w-28"];

function ListBody() {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border">
      {ROW_WIDTHS.map((width, index) => (
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
  );
}

function CardsBody() {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <div
          key={index}
          className="flex min-w-0 flex-col gap-3 rounded-lg border p-4"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 shrink-0 rounded-full" style={delay(index)} />
            <Skeleton className="h-4 w-28" style={delay(index + 1)} />
          </div>
          <Skeleton className="h-3 w-full" style={delay(index + 2)} />
          <Skeleton className="h-3 w-2/3" style={delay(index + 3)} />
        </div>
      ))}
    </div>
  );
}

function FormBody() {
  return (
    <div className="flex min-w-0 max-w-2xl flex-col gap-6">
      {[0, 1, 2].map((section) => (
        <div
          key={section}
          className="flex min-w-0 flex-col gap-3 rounded-lg border p-4"
        >
          <Skeleton className="h-4 w-40" style={delay(section)} />
          <Skeleton className="h-3 w-64" style={delay(section + 1)} />
          <Skeleton className="h-9 w-full rounded-md" style={delay(section + 2)} />
          <Skeleton className="h-9 w-full rounded-md" style={delay(section + 3)} />
        </div>
      ))}
    </div>
  );
}

function SplitBody() {
  return (
    <div className="grid min-h-0 min-w-0 gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="flex min-w-0 items-center gap-2 py-1.5">
            <Skeleton className="size-8 shrink-0 rounded-full" style={delay(index)} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-24" style={delay(index + 1)} />
              <Skeleton className="h-3 w-32" style={delay(index + 2)} />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 rounded-lg border lg:block" />
    </div>
  );
}

const BODIES: Record<PageLoadingShape, () => React.ReactElement> = {
  list: ListBody,
  cards: CardsBody,
  form: FormBody,
  split: SplitBody,
};

export function PageLoading({
  title,
  hint,
  shape = "list",
}: {
  /** The page's own title, so the header does not change when data lands. */
  title: string;
  /**
   * What is being waited on, in the operator's terms — "Reading your
   * calendars…", not "Loading". Says the app is working rather than stuck,
   * which is the entire point of this screen.
   */
  hint: string;
  shape?: PageLoadingShape;
}) {
  const Body = BODIES[shape];

  return (
    <div className="loading-enter flex min-h-0 flex-1 flex-col">
      {/* Same height and border as every real page header, so nothing shifts by
          a pixel when the page arrives. */}
      <header className="h-20 shrink-0 border-b">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1400px] items-center pr-52 pl-14 md:pl-6 lg:pl-10 gap-3">
          <h1 className="shrink-0 truncate text-sm font-semibold tracking-tight">
            {title}
          </h1>
          <span
            role="status"
            className="text-muted-foreground flex items-center gap-1.5 text-xs"
          >
            <Loader2 className="size-3 animate-spin" aria-hidden />
            {hint}
          </span>
        </div>
      </header>

      <div
        aria-hidden
        className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10"
      >
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-6 pb-6">
          <Body />
        </div>
      </div>
    </div>
  );
}
