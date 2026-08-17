"use client";

import { useMemo, useState, useTransition } from "react";
import { Building2, Check, ChevronsUpDown, Loader2, Search } from "lucide-react";

import { returnToAgency, switchToOrg } from "@/app/(app)/sub-accounts/actions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { subAccountInitials, type SubAccount } from "@/lib/orgs/sub-accounts";

/**
 * The account you are in, and the way to any of the others.
 *
 * Back, and meaning what it says this time. The first version listed invented
 * businesses and opened drawn-on empty accounts; it was pulled when the
 * organizations became real, because switching would have shown the agency's
 * contacts under a client's name — every query in the app returned every
 * tenant's rows to an admin.
 *
 * What changed is not this component. `active_org` is a table now, and the RLS
 * policies read it, so picking a client here re-aims all seventy-odd queries
 * in the app at once. Postgres stops handing over the agency's rows; nothing
 * in the UI has to remember to filter them out.
 *
 * A client never sees this. They have one organization, nothing to switch to,
 * and the sidebar only renders it for a platform admin.
 */

function Avatar({ initials, tinted }: { initials: string; tinted: boolean }) {
  return (
    <span
      className={[
        "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        tinted ? "bg-violet-600 text-white" : "bg-muted text-muted-foreground",
      ].join(" ")}
    >
      {initials}
    </span>
  );
}

export function AccountSwitcher({
  currentOrgId,
  currentOrgName,
  agencyName,
  isViewingOther,
  accounts,
}: {
  currentOrgId: string;
  currentOrgName: string;
  agencyName: string;
  isViewingOther: boolean;
  accounts: SubAccount[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;

    // Name and email both: you are as likely to remember a client by the
    // address you invited them at as by their business name.
    return accounts.filter(
      (account) =>
        account.name.toLowerCase().includes(needle) ||
        (account.invitedEmail ?? "").toLowerCase().includes(needle),
    );
  }, [accounts, query]);

  function close() {
    setOpen(false);
    // Cleared on the way out: reopening should show the whole list, not the
    // last thing you typed.
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className={[
            "flex w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:px-0",
            isViewingOther
              ? "border-violet-300 bg-violet-100 text-violet-900 hover:bg-violet-200 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-200 dark:hover:bg-violet-950"
              : "hover:bg-muted/60",
          ].join(" ")}
        >
          {pending ? (
            <Loader2 className="size-6 shrink-0 animate-spin p-1" />
          ) : (
            <Avatar
              initials={
                isViewingOther ? subAccountInitials(currentOrgName) : "VS"
              }
              tinted={isViewingOther}
            />
          )}

          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-xs font-medium">
              {currentOrgName}
            </span>
            <span className="block truncate text-[10px] opacity-75">
              {isViewingOther ? "Client account" : "Agency account"}
            </span>
          </span>

          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60 group-data-[collapsible=icon]:hidden" />
        </button>
      </PopoverTrigger>

      {/* To the right rather than below: the sidebar is narrow, and a panel
          hanging off it covers the nav it came from. */}
      <PopoverContent side="right" align="start" className="w-80 p-2">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a sub account"
            aria-label="Search for a sub account"
            className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent pr-2.5 pl-8 text-xs outline-none focus-visible:ring-[3px]"
          />
        </div>

        {/* Only when you are somewhere else. In your own account this row would
            be a button that takes you where you already are. */}
        {isViewingOther && (
          <>
            <p className="text-muted-foreground px-2 pt-3 pb-1 text-[10px] font-medium tracking-wide uppercase">
              Your account
            </p>
            <button
              type="button"
              onClick={() => {
                close();
                startTransition(() => returnToAgency());
              }}
              className="hover:bg-muted/60 flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors"
            >
              <Avatar initials="VS" tinted={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {agencyName}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  Agency account · everything you own
                </span>
              </span>
            </button>
          </>
        )}

        <p className="text-muted-foreground px-2 pt-3 pb-1 text-[10px] font-medium tracking-wide uppercase">
          Client accounts
        </p>

        {accounts.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-xs">
            No client accounts yet.
          </p>
        ) : matches.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-xs">
            No account matches “{query.trim()}”.
          </p>
        ) : (
          // Caps at roughly six rows before scrolling.
          <ul className="max-h-64 overflow-y-auto">
            {matches.map((account) => {
              const current = account.id === currentOrgId;

              return (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      if (current) return;
                      startTransition(() => switchToOrg(account.id));
                    }}
                    className="hover:bg-muted/60 flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors"
                  >
                    <Avatar
                      initials={subAccountInitials(account.name)}
                      tinted={current}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {account.name}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {account.status === "suspended"
                          ? "Paused"
                          : account.invitedEmail ?? "—"}
                      </span>
                    </span>
                    {current && <Check className="size-3.5 shrink-0 opacity-60" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-muted-foreground mt-2 flex items-start gap-1.5 border-t px-2 pt-2 text-[10px]">
          <Building2 className="mt-px size-3 shrink-0" />
          <span>
            Only the agency sees this. Switching changes what the database will
            hand you, not just what the page draws.
          </span>
        </p>
      </PopoverContent>
    </Popover>
  );
}
