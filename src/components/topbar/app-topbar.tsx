import { DialerBubble } from "@/components/phone/dialer-bubble";
import { Logo } from "@/components/logo";
import { NotificationsBubble } from "@/components/topbar/notifications-bubble";
import { WhatsNewBubble } from "@/components/topbar/whats-new-bubble";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { sortAlerts, type Alert } from "@/lib/alerts";
import { getReplyAlerts } from "@/lib/conversations";
import { applyDismissals } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { getUsageAlerts } from "@/lib/usage/warnings";

/**
 * The bar across the top of every authenticated page.
 *
 * It replaced the mobile-only strip that used to hold nothing but the sidebar
 * trigger, and absorbed that job — so on a phone this is still the row with the
 * menu button and the logo, and the three bubbles sit at its right on every
 * size.
 *
 * Deliberately separate from each page's own header, which stays below it. The
 * bubbles belong to the app, not to the page: the alerts and the dialer are
 * the same wherever you are, and folding them into a per-page header would
 * mean every page re-implementing them.
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

  const [usage, replies] = await Promise.allSettled([
    getUsageAlerts(supabase),
    getReplyAlerts(supabase),
  ]);

  const alerts: Alert[] = [];

  for (const result of [usage, replies]) {
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
    // Taller than a page header on purpose. These are the app's own controls
    // rather than the page's, and at h-12 with 32px buttons they read as a
    // toolbar squeezed into a margin instead of a bar in their own right.
    <div className="flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
      {/* The sidebar's only affordance on mobile; on desktop the rail handles
          it and this would be a second control for the same thing. */}
      <SidebarTrigger className="md:hidden" />
      <Logo className="h-6 md:hidden" />

      {/* gap-2 rather than gap-0.5: three round buttons touching each other
          read as one segmented control, and these do three unrelated things. */}
      <div className="ml-auto flex items-center gap-2">
        <DialerBubble numbers={configuredNumbers()} />
        <WhatsNewBubble />
        <NotificationsBubble alerts={alerts} />
      </div>
    </div>
  );
}
