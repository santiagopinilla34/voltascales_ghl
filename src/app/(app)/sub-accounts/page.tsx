import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { SubAccountsTable } from "@/components/orgs/sub-accounts-table";
import { requirePlatformAdmin } from "@/lib/orgs/context";
import { listSubAccounts } from "@/lib/orgs/queries";

export const metadata: Metadata = { title: "Sub Accounts · VoltaScales" };

// The list changes when you create one, and creating one is the reason you are
// here.
export const dynamic = "force-dynamic";

/**
 * The agency view: every client business, and the way into one.
 *
 * Real now. The organizations are rows, creating one sends an invite the
 * client can actually accept, and the row-level security written in phase 1
 * is what keeps each client's data to themselves.
 *
 * What is not real yet is the *switch*. See the note rendered below — the app's
 * queries do not filter by organization, so stepping into a client would show
 * them the agency's rows. That is phase 3, and until then this page can create
 * accounts and hand them out but not look inside one.
 */
export default async function SubAccountsPage() {
  await requirePlatformAdmin();

  const accounts = await listSubAccounts();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1400px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              Sub Accounts
            </h1>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {accounts.length}
            </span>
          </div>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-6 pb-4">
          <p className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Creating an account here is real: it makes an organization, emails
              the client an invite, and seeds their defaults. Opening one is not
              — the app&apos;s queries don&apos;t filter by organization yet, so
              stepping inside would show them your rows rather than theirs.
              That&apos;s the next phase.
            </span>
          </p>

          <SubAccountsTable accounts={accounts} />

          <section className="flex min-w-0 flex-col gap-2 border-t pt-4">
            <h2 className="text-sm font-semibold tracking-tight">
              What happens when you create one
            </h2>
            <ol className="text-muted-foreground flex list-decimal flex-col gap-1.5 pl-4 text-xs">
              <li>
                An <code className="text-[11px]">organizations</code> row is
                created, with a slug for the booking link it will eventually
                have.
              </li>
              <li>
                The client is emailed an invite. They set their own password —
                you never choose it and never see it, which is deliberate:
                holding a client&apos;s password means holding the ability to
                act as them.
              </li>
              <li>
                They become <code className="text-[11px]">org_owner</code> of
                that organization and nothing else. Row-level security is what
                enforces it, so it holds even if the app has a bug.
              </li>
              <li>
                The account is seeded with a settings row and the system
                automations — the booking confirmation, the cancellation notice,
                the hand-off alert. Without those a new account looks fine and
                silently sends nothing.
              </li>
              <li>
                Their status turns Active the moment they set a password.
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
