import { DialerBubble } from "@/components/phone/dialer-bubble";
import { NotificationsBubble } from "@/components/topbar/notifications-bubble";
import { WhatsNewBubble } from "@/components/topbar/whats-new-bubble";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { sortAlerts, type Alert } from "@/lib/alerts";
import { getErrorAlerts } from "@/lib/app-errors";
import { getBookingAlerts } from "@/lib/booking/alerts";
import { getLeadAlerts, getReplyAlerts } from "@/lib/conversations";
import { applyDismissals } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { voiceConfigured } from "@/lib/twilio/voice";
import { getUsageAlerts } from "@/lib/usage/warnings";

/**
 * The app's own controls, floating in the top row of whatever page is open.
 *
 * This used to be a bar of its own with a border under it, sitting above each
 * page's header. Two stacked rules across the top of every screen, 120px of
 * chrome before any content, and the upper one holding three buttons and
 * otherwise empty all the way across. The row below it was already the page's
 * title bar, so the two are now one row: the page keeps its header, and these
 * ride in the space at its right that no title was using.
 *
 * The strip is transparent and `pointer-events-none`, with only its two ends
 * turned back on — so it covers the header without intercepting anything meant
 * for it, and the header underneath stays the thing that draws the row. Page
 * headers reserve the right-hand end with `pr-40` (see the shared header class
 * in any page under `(app)`); nothing else has to know this is here.
 *
 * The bubbles stay app-level rather than moving into each page's header: the
 * alerts and the dialer are the same wherever you are, and folding them into a
 * per-page header would mean every page re-implementing them.
 *
 * A Server Component, so the numbers the dialer offers can be read from the
 * environment without shipping them through a prop drill from the layout.
 */

/** Reads the env var without the throwing accessor — unset is a valid state. */
function configuredNumbers(): string[] {
  const main = process.env.TWILIO_PHONE_NUMBER?.trim();
  return main ? [main] : [];
}

/**
 * Both alert sources, merged.
 *
 * Composed here rather than in a module of its own because this is the only
 * consumer, and each source already lives with the domain it queries. The two
 * run in parallel, and neither is allowed to take the bar down with it: a
 * failed alert read should cost you the bell, not every page in the app.
 */
async function collectAlerts(): Promise<Alert[]> {
  const supabase = await createClient();

  const results = await Promise.allSettled([
    getUsageAlerts(supabase),
    getReplyAlerts(supabase),
    getLeadAlerts(supabase),
    getBookingAlerts(supabase),
    getErrorAlerts(supabase),
  ]);

  const alerts: Alert[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      alerts.push(...result.value);
    } else {
      console.error("[topbar] alert source failed", result.reason);
    }
  }

  // Marks the ones already dealt with. Same treatment as the sources: a failed
  // read here should cost you the dismissals, not the bell — showing an alert
  // twice is a far smaller problem than the bar throwing.
  try {
    return sortAlerts(await applyDismissals(supabase, alerts));
  } catch (error) {
    console.error("[topbar] dismissals unavailable", error);
    return sortAlerts(alerts);
  }
}

export async function AppTopbar() {
  const alerts = await collectAlerts();

  return (
    // h-20 is the page-header height, so these centre on the title beside
    // them. z-20 clears the header's own border; the strip has no background
    // of its own, so the header still paints the row.
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-20">
      {/* Wider than the page's 1400px column by its two gutters and a little
          over, so these hang just past the outside edge of the content rather
          than sitting inside the measure the text uses — which is where a
          control belonging to the app and not to the page should be.

          Pinned to the window edge instead, as they were, they sat a hundred
          and fifty pixels out past the last card on a wide monitor: the only
          things in the app not lining up with anything. Flush with the
          content, they crowded it. This is the ledge between the two.

          Only wide screens see any of this. Below about 1700px the column
          stops being the narrower of the two and the padding here is all that
          separates the bubbles from the window edge, which is why it stays. */}
      <div className="mx-auto flex h-full w-full max-w-[1540px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        {/* The sidebar's only affordance on mobile; on desktop the rail
            handles it and this would be a second control for the same thing.
            The mobile logo went with the old bar — on a phone the sheet this
            opens has the wordmark at the top of it, and the page's own title
            is right here. */}
        <SidebarTrigger className="pointer-events-auto md:hidden" />

        {/* Loosely spaced rather than tight: three round buttons close
            together read as one segmented control, and these do three
            unrelated things — place a call, read what changed, read what
            needs you. */}
        <div className="pointer-events-auto ml-auto flex items-center gap-3.5">
          <DialerBubble
            numbers={configuredNumbers()}
            configured={voiceConfigured()}
          />
          <WhatsNewBubble />
          <NotificationsBubble alerts={alerts} />
        </div>
      </div>
    </div>
  );
}
