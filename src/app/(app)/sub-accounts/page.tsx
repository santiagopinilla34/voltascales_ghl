import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { SubAccountsTable } from "@/components/orgs/sub-accounts-table";

export const metadata: Metadata = { title: "Sub Accounts · VoltaScales" };

/**
 * Sub Accounts (front end).
 *
 * The agency view: every client business you run, and a way to step into one
 * and see the app as they see it. All of it simulated — see the module comment
 * in `src/lib/orgs/sub-accounts.ts` for what has to exist behind it.
 *
 * "Admin-only" here means the nav item is hidden while you are inside a client
 * account. It is not a permission check, and cannot be one: there are no roles
 * yet, so every signed-in user is the admin and this URL is reachable by
 * typing it. The page says as much rather than implying a guard that isn't
 * there.
 */
export default function SubAccountsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <h1 className="truncate text-sm font-semibold tracking-tight">
          Sub Accounts
        </h1>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-6 pb-4">
          <p className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              This page is the front end only. Every client below is invented,
              creating one saves nothing and emails nobody, and opening one
              simulates the context switch in the browser — there are no
              organizations, no roles and no data isolation behind it yet.
            </span>
          </p>

          <SubAccountsTable />

          <section className="flex min-w-0 flex-col gap-2 border-t pt-4">
            <h2 className="text-sm font-semibold tracking-tight">
              What has to be real before this is
            </h2>
            <ul className="text-muted-foreground flex flex-col gap-1.5 text-xs">
              <li>
                <strong className="text-foreground">
                  An organization per client.
                </strong>{" "}
                Every table that holds client data needs an{" "}
                <code className="text-[11px]">org_id</code>, and every existing
                row needs one backfilled to yours. That migration is the whole
                job — the page above is an afternoon.
              </li>
              <li>
                <strong className="text-foreground">
                  Row-level security on it.
                </strong>{" "}
                Policies keyed on the caller&apos;s organization are the only
                thing that actually keeps one client&apos;s contacts away from
                another&apos;s. Filtering in the front end is decoration.
              </li>
              <li>
                <strong className="text-foreground">
                  Two roles, one of them yours.
                </strong>{" "}
                <code className="text-[11px]">platform_admin</code> reaches
                across organizations,{" "}
                <code className="text-[11px]">org_owner</code> is scoped to one.
                The nav difference you can see by opening an account is the
                cosmetic half of that.
              </li>
              <li>
                <strong className="text-foreground">
                  A magic-link invite.
                </strong>{" "}
                What moves a row from Invited to Active, and what decides who the
                first <code className="text-[11px]">org_owner</code> is.
              </li>
              <li>
                <strong className="text-foreground">
                  Switching that the server honours.
                </strong>{" "}
                Context has to travel in the session and be re-checked on every
                query, not held in the browser. Anything else means a client
                could ask for another client&apos;s data and be given it.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
