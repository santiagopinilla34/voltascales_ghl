"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";

import { useOrgContext } from "@/components/orgs/org-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PREVIEW_SUB_ACCOUNTS,
  STATUS_LABELS,
  formatSubAccountDate,
  newSubAccountId,
  subAccountInitials,
  type SubAccount,
} from "@/lib/orgs/sub-accounts";

/**
 * The list of client accounts, and the form that adds one.
 *
 * Both halves are local state. Creating a sub account appends a row and
 * nothing else: no organization is inserted, no member row is written, and no
 * invite is sent — which is why the row lands on `invited` and stays there.
 * Refreshing puts the list back to the preview five.
 *
 * Clicking a row is the way into the simulated context switch. It is also the
 * only way: there is no free-floating "view as client" toggle, because a role
 * that isn't attached to an account is a state the real system can't be in.
 */

/** Where you land inside a sub account — the first item in the client's nav. */
const LANDING_PATH = "/inbox";

function StatusBadge({ status }: { status: SubAccount["status"] }) {
  return (
    <Badge variant={status === "active" ? "secondary" : "outline"}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function CreateSubAccountDialog({
  onCreate,
}: {
  onCreate: (account: SubAccount) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) return;

    onCreate({
      id: newSubAccountId(),
      name: trimmedName,
      ownerEmail: trimmedEmail,
      status: "invited",
      createdAt: new Date().toISOString().slice(0, 10),
    });

    setOpen(false);
    setName("");
    setEmail("");

    toast.info("Added to the list — no invite was sent.", {
      description:
        "Nothing was saved and no email went out. Creating a real sub account needs the organizations table and the magic-link invite, neither of which is built.",
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Create sub account
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Create a sub account</DialogTitle>
            <DialogDescription>
              This form is a preview. It adds a row to the list in front of you
              and sends nothing to anyone.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="business-name">Business name</Label>
              <Input
                id="business-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Harbour Landscaping"
                autoComplete="off"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="client-email">Client email</Label>
              <Input
                id="client-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@harbourlandscaping.example"
                autoComplete="off"
                required
              />
              <p className="text-muted-foreground text-xs">
                Eventually the magic link goes here and the account becomes
                active when it is clicked. For now the row just says Invited.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !email.trim()}>
              Create sub account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SubAccountsTable() {
  const router = useRouter();
  const { enter } = useOrgContext();
  const [accounts, setAccounts] = useState<SubAccount[]>(PREVIEW_SUB_ACCOUNTS);

  function open(account: SubAccount) {
    enter({ id: account.id, name: account.name });
    router.push(LANDING_PATH);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">
            Client accounts
          </h2>
          <p className="text-muted-foreground text-xs">
            {accounts.length} invented {accounts.length === 1 ? "account" : "accounts"} ·
            open one to see the app as that client sees it
          </p>
        </div>
        <CreateSubAccountDialog
          onCreate={(account) => setAccounts((current) => [account, ...current])}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Business</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              {/* Holds the chevron. Labelled for screen readers only — a
                  visible header over a column of arrows reads as noise. */}
              <TableHead className="w-10">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {accounts.map((account) => (
              <TableRow
                key={account.id}
                className="cursor-pointer"
                // A row, not a link: entering an account is a state change in
                // the browser, and the destination depends on state the link
                // would have to duplicate.
                onClick={() => open(account)}
                tabIndex={0}
                role="button"
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    open(account);
                  }
                }}
              >
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                      {subAccountInitials(account.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {account.name}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {account.ownerEmail}
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <StatusBadge status={account.status} />
                </TableCell>

                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                  {formatSubAccountDate(account.createdAt)}
                </TableCell>

                <TableCell>
                  <ChevronRight className="text-muted-foreground size-4" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
