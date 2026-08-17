import { Building2 } from "lucide-react";

import { subAccountInitials } from "@/lib/orgs/sub-accounts";

/**
 * Which account you are signed into, under the wordmark.
 *
 * What is left of the switcher, and deliberately so. The popover version listed
 * every client and moved between them, which was honest while the accounts
 * were invented and the destination was a drawn-on empty state. Now that the
 * organizations are real and hold real rows, switching would point the app at
 * a client while its queries still fetch across every tenant — the agency's
 * contacts under the client's name. A control that does the wrong thing
 * convincingly is worse than no control.
 *
 * So this reads out the account and does not pretend to change it. The
 * switcher comes back in phase 3, when the queries filter by organization and
 * the destination is that client's data rather than yours.
 *
 * A plain server component: the identity comes from the session, and there is
 * nothing here to click.
 */
export function AccountBadge({
  name,
  isPlatformAdmin,
}: {
  name: string;
  isPlatformAdmin: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:px-0">
      <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
        {isPlatformAdmin ? <Building2 className="size-3.5" /> : subAccountInitials(name)}
      </span>

      <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        <span className="block truncate text-xs font-medium" title={name}>
          {name}
        </span>
        <span className="text-muted-foreground block truncate text-[10px]">
          {isPlatformAdmin ? "Agency account" : "Your account"}
        </span>
      </span>
    </div>
  );
}
