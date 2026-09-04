import { CalendarClock, Tag, UserPlus, Users } from "lucide-react";

import { Sparkline } from "@/components/contacts/sparkline";
import type { ContactWithActivity } from "@/lib/contacts";
import { TIME_ZONE } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The four numbers above the Contacts table.
 *
 * Every one of them is derived from the rows already on the page rather than
 * from four more queries. The list is the whole table —
 * `listContactsWithActivity` has no limit — so a second round trip would be
 * asking the database to count something this component is already holding.
 *
 * The sparklines are real history, not decoration: each is the same metric
 * bucketed into the last ten weeks. Two of them (Total, With tags) are
 * cumulative because the quantity they measure is a running total, and a
 * running total that dips would be a lie about contacts having been deleted.
 * The other two count what happened inside each week, which is what "new" and
 * "active" mean.
 *
 * A Server Component: nothing here is interactive, and the arithmetic is
 * cheaper to do once on the server than to ship every date to the browser for.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BUCKETS = 10;

/** `YYYY-MM` in the app's fixed zone, so "this month" is the operator's. */
const monthKeyFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: TIME_ZONE,
});

function monthKey(date: Date): string {
  return monthKeyFormat.format(date).slice(0, 7);
}

/** How many of `times` fall in each of the last `BUCKETS` weeks, oldest first. */
function weekly(times: number[], now: number): number[] {
  const series = new Array<number>(BUCKETS).fill(0);

  for (const time of times) {
    // Clock skew, or an imported row stamped in the future, lands in the
    // current week rather than off the front of the array.
    const index = BUCKETS - 1 - Math.floor(Math.max(0, now - time) / WEEK_MS);
    if (index >= 0) series[index] += 1;
  }

  return series;
}

/**
 * Turns per-week counts into a running total that *ends* at `total`.
 *
 * Backfilled from the end rather than accumulated from the start, because
 * anything created before the window still exists and the line has to begin
 * where those left it. Accumulated forwards, a year-old account with a quiet
 * quarter would draw a curve rising out of zero.
 */
function runningTotal(series: number[], total: number): number[] {
  const out = new Array<number>(series.length);
  let carried = total;

  for (let i = series.length - 1; i >= 0; i--) {
    out[i] = carried;
    carried -= series[i];
  }

  return out;
}

/** Rounded percentage change, or null when there is no baseline to divide by. */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

type Stat = {
  label: string;
  value: number;
  icon: typeof Users;
  /** Small print under the number. A node so one card can colour part of it. */
  footnote: React.ReactNode;
  series: number[];
  /** One hue per card: the icon tile, and the line under it. */
  tint: string;
  lineTint: string;
};

/**
 * Everything the cards show, worked out from the rows.
 *
 * A plain function rather than the body of the component because it reads the
 * clock, and "what time is it" is not something a render should be asking —
 * the same rule that keeps `formatListTimestamp` taking `now` as an argument
 * instead of calling `new Date()` inline. Here the clock is read once, at the
 * top, and every one of the four numbers is measured against that single
 * instant; sampling it four times would let a card land on the far side of a
 * week boundary from its neighbour.
 */
function deriveStats(contacts: ContactWithActivity[]): Stat[] {
  const now = Date.now();
  const today = new Date(now);

  const thisMonth = monthKey(today);
  // Day 0 of this month is the last day of the previous one, which sidesteps
  // the January-minus-one wraparound.
  const lastMonth = monthKey(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)),
  );

  const created = contacts.map((contact) => Date.parse(contact.created_at));
  const tagged = contacts.filter((contact) => contact.tags.length > 0);
  const activity = contacts.map((contact) => Date.parse(contact.lastActivityAt));

  const newThisMonth = contacts.filter(
    (contact) => monthKey(new Date(contact.created_at)) === thisMonth,
  ).length;
  const newLastMonth = contacts.filter(
    (contact) => monthKey(new Date(contact.created_at)) === lastMonth,
  ).length;
  const change = percentChange(newThisMonth, newLastMonth);

  const activeThisWeek = activity.filter((time) => now - time < WEEK_MS).length;

  return [
    {
      label: "Total contacts",
      value: contacts.length,
      icon: Users,
      footnote: "All time",
      series: runningTotal(weekly(created, now), contacts.length),
      tint: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20 dark:text-emerald-400",
      lineTint: "text-emerald-500 dark:text-emerald-400",
    },
    {
      label: "New this month",
      value: newThisMonth,
      icon: UserPlus,
      // No baseline means no percentage. Saying "100%" against a month with
      // nothing in it would be arithmetic on a divide-by-zero.
      footnote:
        change === null ? (
          newThisMonth > 0 ? (
            "First ones since last month"
          ) : (
            "None last month either"
          )
        ) : (
          <>
            <span
              className={
                change >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }
            >
              {change >= 0 ? "↑" : "↓"} {Math.abs(change)}%
            </span>{" "}
            vs last month
          </>
        ),
      series: weekly(created, now),
      tint: "bg-violet-500/10 text-violet-500 ring-violet-500/20 dark:text-violet-400",
      lineTint: "text-violet-500 dark:text-violet-400",
    },
    {
      label: "With tags",
      value: tagged.length,
      icon: Tag,
      footnote:
        contacts.length === 0
          ? "No contacts yet"
          : `${Math.round((tagged.length / contacts.length) * 100)}% of total`,
      // Tags carry no timestamp of their own, so this is tagged contacts by
      // the date the *contact* arrived — the shape of who got tagged, not of
      // when the tagging happened.
      series: runningTotal(
        weekly(
          tagged.map((contact) => Date.parse(contact.created_at)),
          now,
        ),
        tagged.length,
      ),
      tint: "bg-sky-500/10 text-sky-500 ring-sky-500/20 dark:text-sky-400",
      lineTint: "text-sky-500 dark:text-sky-400",
    },
    {
      label: "Active this week",
      value: activeThisWeek,
      icon: CalendarClock,
      footnote: "Last 7 days",
      series: weekly(activity, now),
      tint: "bg-amber-500/10 text-amber-500 ring-amber-500/20 dark:text-amber-400",
      lineTint: "text-amber-500 dark:text-amber-400",
    },
  ];
}

export function ContactsStats({
  contacts,
}: {
  contacts: ContactWithActivity[];
}) {
  const stats = deriveStats(contacts);

  return (
    // Two across before four, rather than one straight to four: at tablet
    // widths four cards leave each too narrow for a number and a curve side
    // by side.
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-card/40 relative overflow-hidden rounded-xl border p-5"
        >
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl ring-1",
                stat.tint,
              )}
            >
              <stat.icon className="size-5" />
            </span>

            <div className="min-w-0">
              <p className="text-muted-foreground truncate text-sm">
                {stat.label}
              </p>
              <p className="text-[1.75rem] leading-tight font-semibold tracking-tight tabular-nums">
                {stat.value}
              </p>
            </div>
          </div>

          {/* The footnote wraps rather than truncates, and the curve is the
              one that gives ground. A card is at its narrowest not on a phone
              — where it has the whole width — but in the two- and four-across
              bands, where the 256px sidebar is also out: at 1280 the four
              cards are 224px each, and a 112px curve left "↓ 100% vs last
              month" as "↓ 100% …". Half a sentence is worse than a shorter
              line, and the curve carries no reading that losing 32px spoils. */}
          <div className="mt-5 flex items-end justify-between gap-3">
            <p className="text-muted-foreground min-w-0 text-xs">
              {stat.footnote}
            </p>
            <Sparkline
              values={stat.series}
              gradientId={`spark-${stat.label.replace(/\s+/g, "-").toLowerCase()}`}
              className={cn("h-9 w-20 shrink-0 2xl:w-28", stat.lineTint)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
