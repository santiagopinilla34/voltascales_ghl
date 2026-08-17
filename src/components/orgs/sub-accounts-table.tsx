"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createSubAccount, switchToOrg } from "@/app/(app)/sub-accounts/actions";
import { ManageSubAccountDialog } from "@/components/orgs/manage-sub-account-dialog";
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
  STATUS_LABELS,
  formatSubAccountDate,
  subAccountInitials,
  type SubAccount,
} from "@/lib/orgs/sub-accounts";

/**
 * The client list, the form that creates one, and the way into each.
 *
 * Rows open the account. They did not for a while — between the organizations
 * becoming real and `active_org` existing, opening one would have shown the
 * agency's own rows under a client's name, so the control was removed rather
 * than left to mislead. Now the switch is enforced by the database and the row
 * does what it looks like it does.
 *
 * Manage is a button rather than another row action because it is the one
 * thing here you do *about* a client instead of *as* them.
 */

function StatusBadge({ status }: { status: SubAccount["status"] }) {
  return (
    <Badge
      variant={
        status === "active"
          ? "secondary"
          : status === "suspended"
            ? "destructive"
            : "outline"
      }
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function CreateSubAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createSubAccount({
        businessName: name,
        clientEmail: email,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setOpen(false);
      setName("");
      setEmail("");
      toast.success("Account created and the invite is on its way.", {
        description: `${email} can set their own password from the link and sign straight in.`,
      });
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
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
              This creates the account and emails the client an invite. They
              choose their own password — you won&apos;t see it.
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
                disabled={pending}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="client-email">Client email</Label>
              <Input
                id="client-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@harbourlandscaping.com"
                autoComplete="off"
                required
                disabled={pending}
              />
              <p className="text-muted-foreground text-xs">
                The invite goes here. Make sure it&apos;s right — the link is
                what makes them the owner of this account.
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !name.trim() || !email.trim()}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create and invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SubAccountsTable({ accounts }: { accounts: SubAccount[] }) {
  const [, startTransition] = useTransition();

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">
            Client accounts
          </h2>
          <p className="text-muted-foreground text-xs">
            Each one is a separate account with its own login and its own data.
          </p>
        </div>
        <CreateSubAccountDialog />
      </div>

      {accounts.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          No client accounts yet. Create one and the client gets an invite by
          email.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Business</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                {/* Holds the Manage button. Labelled for screen readers only —
                    a visible header over a column of buttons reads as noise. */}
                <TableHead className="w-10">
                  <span className="sr-only">Manage</span>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {accounts.map((account) => (
                <TableRow
                  key={account.id}
                  className="cursor-pointer"
                  // A row, not a link: switching is a server-side state change
                  // and the destination depends on it.
                  onClick={() => startTransition(() => switchToOrg(account.id))}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      startTransition(() => switchToOrg(account.id));
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
                          {account.invitedEmail ?? "—"}
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

                  {/* Stops the row's own click firing underneath: opening the
                      Manage window should not also switch you into the account
                      you were about to change. */}
                  <TableCell
                    className="text-right"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ManageSubAccountDialog account={account} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
