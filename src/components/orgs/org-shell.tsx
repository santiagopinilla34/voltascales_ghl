"use client";

import { OrgBanner } from "@/components/orgs/org-banner";
import { useOrgContext } from "@/components/orgs/org-context";
import { SimulatedAccount } from "@/components/orgs/simulated-account";

/**
 * Decides whether you are looking at your own app or a client's.
 *
 * Sits between the top bar and the page inside `SidebarInset`, so the shell —
 * sidebar, top bar, banner — is continuous across the switch and only the page
 * beneath it changes. That continuity is the point: stepping into a client
 * account should feel like the same app showing you something else, not like
 * being sent somewhere.
 *
 * Renders a fragment rather than a wrapper element. `SidebarInset` is the flex
 * column that every page's `flex-1` sizing depends on, and a div in between
 * would break the height of all of them.
 */
export function OrgShell({ children }: { children: React.ReactNode }) {
  const { org } = useOrgContext();

  return (
    <>
      <OrgBanner />
      {org ? <SimulatedAccount /> : children}
    </>
  );
}
