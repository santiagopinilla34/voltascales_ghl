import { DialerBubble } from "@/components/phone/dialer-bubble";
import { Logo } from "@/components/logo";
import { NotificationsBubble } from "@/components/topbar/notifications-bubble";
import { WhatsNewBubble } from "@/components/topbar/whats-new-bubble";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { PREVIEW_ALERTS } from "@/lib/alerts";

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

export function AppTopbar() {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      {/* The sidebar's only affordance on mobile; on desktop the rail handles
          it and this would be a second control for the same thing. */}
      <SidebarTrigger className="md:hidden" />
      <Logo className="h-6 md:hidden" />

      <div className="ml-auto flex items-center gap-0.5">
        <DialerBubble numbers={configuredNumbers()} />
        <WhatsNewBubble />
        <NotificationsBubble alerts={PREVIEW_ALERTS} />
      </div>
    </div>
  );
}
