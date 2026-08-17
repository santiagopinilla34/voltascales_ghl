"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Building2, Check, ChevronsUpDown, Search } from "lucide-react";

import { useOrgContext } from "@/components/orgs/org-context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { subAccountInitials, type SubAccount } from "@/lib/orgs/sub-accounts";

/**
 * The account you are in, and the way to any of the others.
 *
 * Sits under the wordmark, which is where the equivalent lives in every agency
 * tool worth copying: it is the answer to "whose data am I about to change",
 * and it belongs next to the nav that acts on that data rather than off in a
 * corner of the top bar.
 *
 * ## Who sees it
 *
 * This is the platform admin's control, and it is the one piece of admin
 * chrome that survives stepping into a client account — otherwise the way out
 * would be the banner alone, and hopping between two clients would mean
 * going back to the list every time.
 *
 * A real client never sees it. They are `org_owner` of exactly one
 * organization, the list would have one row in it and no agency to return to,
 * so there is nothing for a switcher to switch. That is a claim about the
 * backend, not something this can enforce: right now everyone signed in is the
 * admin, and the popover says so at the bottom rather than implying a check.
 *
 * Front end only, like everything else under `components/orgs`.
 */

/** Where switching into a client lands — the first item in the client's nav. */
const CLIENT_LANDING = "/inbox";

/** Where returning to the agency lands — the list you switch from. */
const AGENCY_LANDING = "/sub-accounts";

function Avatar({
  initials,
  tinted,
}: {
  initials: string;
  /** Violet for a client account, muted for your own. */
  tinted: boolean;
}) {
  return (
    <span
      className={[
        "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        tinted
          ? "bg-violet-600 text-white"
          : "bg-muted text-muted-foreground",
      ].join(" ")}
    >
      {initials}
    </span>
  );
}

function AccountRow({
  name,
  detail,
  initials,
  tinted,
  current,
  onSelect,
}: {
  name: string;
  detail: string;
  initials: string;
  tinted: boolean;
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="hover:bg-muted/60 flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors"
      >
        <Avatar initials={initials} tinted={tinted} />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{name}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {detail}
          </span>
        </span>

        {/* Marks where you already are, so the list reads as a position rather
            than a menu of identical options. */}
        {current && <Check className="size-3.5 shrink-0 opacity-60" />}
      </button>
    </li>
  );
}

export function AccountSwitcher() {
  const router = useRouter();
  const { org, accounts, enter, leave } = useOrgContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;

    // Name and email both, because you are as likely to remember a client by
    // the address you invited them at as by their business name.
    return accounts.filter(
      (account) =>
        account.name.toLowerCase().includes(needle) ||
        account.ownerEmail.toLowerCase().includes(needle),
    );
  }, [accounts, query]);

  function close() {
    setOpen(false);
    // Cleared on the way out rather than the way in: reopening should show the
    // whole list, not the last thing you typed.
    setQuery("");
  }

  function switchTo(account: SubAccount) {
    close();
    if (account.id === org?.id) return;

    enter({ id: account.id, name: account.name });
    router.push(CLIENT_LANDING);
  }

  function returnToAgency() {
    close();
    if (!org) return;

    leave();
    router.push(AGENCY_LANDING);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={[
            "flex w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
            // Collapsed to the icon rail there is room for the avatar and
            // nothing else, so the padding goes and it centres.
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:px-0",
            org
              ? "border-violet-300 bg-violet-100 text-violet-900 hover:bg-violet-200 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-200 dark:hover:bg-violet-950"
              : "hover:bg-muted/60",
          ].join(" ")}
        >
          <Avatar
            initials={org ? subAccountInitials(org.name) : "VS"}
            tinted={Boolean(org)}
          />

          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-xs font-medium">
              {org ? org.name : "VoltaScales"}
            </span>
            <span className="block truncate text-[10px] opacity-75">
              {org ? "Client account · simulated" : "Agency account"}
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
            // Focused on open so the menu can be driven from the keyboard the
            // whole way: click, type two letters, Tab, Enter.
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a sub account"
            aria-label="Search for a sub account"
            className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent pr-2.5 pl-8 text-xs outline-none focus-visible:ring-[3px]"
          />
        </div>

        {/* Only when you are somewhere else. In your own account this row
            would be a button that takes you where you already are. */}
        {org && (
          <>
            <p className="text-muted-foreground px-2 pt-3 pb-1 text-[10px] font-medium tracking-wide uppercase">
              Your account
            </p>
            <ul>
              <AccountRow
                name="VoltaScales"
                detail="Agency account · everything you own"
                initials="VS"
                tinted={false}
                current={false}
                onSelect={returnToAgency}
              />
            </ul>
          </>
        )}

        <p className="text-muted-foreground px-2 pt-3 pb-1 text-[10px] font-medium tracking-wide uppercase">
          All accounts
        </p>

        {matches.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-xs">
            No account matches “{query.trim()}”.
          </p>
        ) : (
          // Caps at roughly six rows before scrolling. Five invented accounts
          // fit today; a real agency has forty.
          <ul className="max-h-64 overflow-y-auto">
            {matches.map((account) => (
              <AccountRow
                key={account.id}
                name={account.name}
                detail={account.ownerEmail}
                initials={subAccountInitials(account.name)}
                tinted={account.id === org?.id}
                current={account.id === org?.id}
                onSelect={() => switchTo(account)}
              />
            ))}
          </ul>
        )}

        <p className="text-muted-foreground mt-2 flex items-start gap-1.5 border-t px-2 pt-2 text-[10px]">
          <Building2 className="mt-px size-3 shrink-0" />
          <span>
            Simulated. Only the agency gets this menu — a client owns one
            account and has nowhere to switch to. Nothing enforces that yet.
          </span>
        </p>
      </PopoverContent>
    </Popover>
  );
}
