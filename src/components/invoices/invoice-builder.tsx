"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Copy,
  FileText,
  Loader2,
  Package as PackageIcon,
  PlusCircle,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { generateInvoice } from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { contactLabel, formatPhone } from "@/lib/format";
import { formatCents, parsePriceToCents } from "@/lib/invoices/money";
import type { DepositChoice, OngoingChoice } from "@/lib/invoices/render";
import type { Contact, Package } from "@/types/database";

type ContactOption = Pick<
  Contact,
  "id" | "name" | "phone" | "email" | "business_name"
>;

/** Every field on this form is this tall, so the column reads as one rhythm. */
const FIELD = "h-11";

export function InvoiceBuilder({
  contacts,
  packages,
  businessConfigured,
}: {
  contacts: ContactOption[];
  packages: Package[];
  /** False until a business name is set, which the invoice footer needs. */
  businessConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [contactId, setContactId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [deposit, setDeposit] = useState<DepositChoice>("fifty_fifty");
  const [ongoing, setOngoing] = useState<OngoingChoice>("retainer");
  const [retainer, setRetainer] = useState("500.00");
  const [commission, setCommission] = useState("10");
  const [notes, setNotes] = useState("");

  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const contact = contacts.find((entry) => entry.id === contactId) ?? null;

  // The packages on the invoice, in the order they were added, and the ones
  // still on offer. Two derived lists rather than a flag per package: the form
  // shows what is on the invoice, and the menu shows what could join it.
  const chosen = useMemo(
    () =>
      selected
        .map((id) => packages.find((item) => item.id === id))
        .filter((item): item is Package => Boolean(item)),
    [selected, packages],
  );
  const available = packages.filter((item) => !selected.includes(item.id));

  // Mirrors the server's arithmetic so the figures on screen match the ones
  // that will be rendered. The server recomputes rather than trusting these.
  const subtotalCents = chosen.reduce((sum, item) => sum + item.price_cents, 0);
  const depositCents =
    deposit === "fifty_fifty" ? Math.round(subtotalCents / 2) : subtotalCents;

  function add(id: string) {
    setSelected((current) =>
      current.includes(id) ? current : [...current, id],
    );
  }

  function drop(id: string) {
    setSelected((current) => current.filter((entry) => entry !== id));
  }

  function generate(event: React.FormEvent) {
    event.preventDefault();

    const retainerCents = parsePriceToCents(retainer) ?? 0;
    const commissionPercent = Number(commission);

    startTransition(async () => {
      const result = await generateInvoice({
        contactId,
        packageIds: selected,
        deposit,
        ongoing,
        retainerCents,
        commissionPercent,
        notes,
      });

      if (!result.ok) {
        toast.error("Could not generate the invoice", {
          description: result.error,
        });
        return;
      }

      setHtml(result.value.html);
      setCopied(false);
      toast.success(`Invoice #${result.value.invoiceNumber} generated`);
      router.refresh();
    });
  }

  async function copy() {
    if (!html) return;

    // Written as both HTML and plain text: pasting into an email client picks
    // the rich flavour and lands the rendered invoice, while anything that
    // only understands text still gets the markup rather than nothing.
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([html], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(html);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const ready = Boolean(contactId) && selected.length > 0 && businessConfigured;

  return (
    <div className="flex flex-col gap-6">
      {!businessConfigured && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Set your business name on the <strong>My Business</strong> page before
          generating an invoice — it appears in the footer of every one.
        </p>
      )}

      <form onSubmit={generate} className="flex flex-col gap-6">
        <div className="grid gap-2">
          <Label htmlFor="invoice-contact">Client</Label>

          <div className="flex items-start gap-2">
            <Select
              value={contactId}
              onValueChange={setContactId}
              disabled={pending}
            >
              <SelectTrigger
                id="invoice-contact"
                className={`${FIELD} min-w-0 flex-1`}
              >
                <SelectValue placeholder="Pick a contact" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {contactLabel(entry)}
                    {entry.business_name ? ` · ${entry.business_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Invoicing someone who is not a contact yet is a dead end on this
                form — the client block is built from the contact record. This
                is the way out of it. */}
            <Button
              asChild
              variant="outline"
              size="icon"
              className={`${FIELD} w-11 shrink-0`}
              aria-label="Add a contact"
              title="Add a contact"
            >
              <Link href="/contacts">
                <UserPlus className="size-4" />
              </Link>
            </Button>
          </div>

          {contact && (
            <div className="text-muted-foreground rounded-md border p-2 text-xs">
              <p className="tabular-nums">{formatPhone(contact.phone)}</p>
              {contact.email ? (
                <p>{contact.email}</p>
              ) : (
                <p className="text-amber-700 dark:text-amber-400">
                  No email on this contact — the invoice will show a blank line.
                  Add one on their contact page.
                </p>
              )}
              {!contact.business_name && (
                <p className="text-amber-700 dark:text-amber-400">
                  No business name on this contact.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <Label>Packages</Label>

          {packages.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
              No packages yet. Add them on the My Business page.
            </p>
          ) : (
            <>
              {/* What is on the invoice, one row each. A list you add to and
                  take from, rather than a checklist to read past: the rows are
                  the invoice, so the ones that aren't on it aren't here. */}
              {chosen.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {chosen.map((item) => (
                    <li
                      key={item.id}
                      className="bg-muted/30 flex items-center gap-3 rounded-lg border p-3"
                    >
                      <span
                        className="bg-background flex size-9 shrink-0 items-center justify-center rounded-lg border"
                        aria-hidden
                      >
                        <PackageIcon className="text-muted-foreground size-4" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {item.name}
                        </span>
                        {item.description && (
                          <span className="text-muted-foreground block truncate text-xs">
                            {item.description}
                          </span>
                        )}
                      </span>

                      <span className="shrink-0 text-sm tabular-nums">
                        {formatCents(item.price_cents)}
                      </span>

                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0"
                        disabled={pending}
                        onClick={() => drop(item.id)}
                        aria-label={`Remove ${item.name}`}
                      >
                        <X className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={pending || available.length === 0}
                    className="bg-muted/30 hover:bg-muted/50 focus-visible:ring-ring/50 flex h-12 w-full items-center gap-2 rounded-lg border px-3 text-sm font-medium text-emerald-500 transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 disabled:text-muted-foreground"
                  >
                    <PlusCircle className="size-4" />
                    {available.length === 0
                      ? "Every package is on this invoice"
                      : "Add another package"}
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="start" className="w-72">
                  {available.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      onSelect={() => add(item.id)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.name}
                      </span>
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {formatCents(item.price_cents)}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="invoice-deposit">Payment structure</Label>
            <Select
              value={deposit}
              onValueChange={(value) => setDeposit(value as DepositChoice)}
              disabled={pending}
            >
              <SelectTrigger id="invoice-deposit" className={`${FIELD} w-full`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fifty_fifty">50/50 deposit</SelectItem>
                <SelectItem value="full_upfront">Full payment upfront</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="invoice-ongoing">Ongoing</Label>
            <Select
              value={ongoing}
              onValueChange={(value) => setOngoing(value as OngoingChoice)}
              disabled={pending}
            >
              <SelectTrigger id="invoice-ongoing" className={`${FIELD} w-full`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retainer">Monthly retainer</SelectItem>
                <SelectItem value="commission">Commission percentage</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {ongoing === "retainer" ? (
          <div className="grid max-w-56 gap-2">
            <Label htmlFor="invoice-retainer">Retainer per month (CAD)</Label>
            <Input
              id="invoice-retainer"
              value={retainer}
              onChange={(event) => setRetainer(event.target.value)}
              inputMode="decimal"
              className={`${FIELD} tabular-nums`}
              disabled={pending}
            />
          </div>
        ) : (
          <div className="grid max-w-56 gap-2">
            <Label htmlFor="invoice-commission">Commission (%)</Label>
            <Input
              id="invoice-commission"
              value={commission}
              onChange={(event) => setCommission(event.target.value)}
              inputMode="numeric"
              className={`${FIELD} tabular-nums`}
              disabled={pending}
            />
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="invoice-notes">Notes (optional)</Label>
          <Textarea
            id="invoice-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything else the client should see"
            disabled={pending}
            className="min-h-20"
          />
          <p className="text-muted-foreground text-xs">
            Left blank, the notes row is left off the invoice entirely.
          </p>
        </div>

        {selected.length > 0 && (
          <dl className="bg-muted/40 grid gap-1 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="tabular-nums">{formatCents(subtotalCents)}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>Due on this invoice</dt>
              <dd className="tabular-nums">{formatCents(depositCents)}</dd>
            </div>
            {deposit === "fifty_fifty" && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Due on completion</dt>
                <dd className="tabular-nums">
                  {formatCents(subtotalCents - depositCents)}
                </dd>
              </div>
            )}
          </dl>
        )}

        <div>
          <Button
            type="submit"
            disabled={!ready || pending}
            className="h-11 gap-2 bg-emerald-600 px-4 text-white hover:bg-emerald-500"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}
            Generate invoice
          </Button>
        </div>
      </form>

      {html && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Preview</h2>
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy for email"}
            </Button>
          </div>

          {/* srcDoc, not dangerouslySetInnerHTML: the invoice carries its own
              <html>/<body> and page-wide styling, which would leak into the
              dashboard if injected inline. The iframe also keeps it looking
              exactly as the client will see it. */}
          <iframe
            title="Invoice preview"
            srcDoc={html}
            // Shorter on a phone: the invoice is a fixed-width document that
            // scrolls inside its own frame, and 36rem of it crowds out every
            // control on the page above.
            className="h-[24rem] w-full rounded-lg border bg-white sm:h-[36rem]"
          />

          <p className="text-muted-foreground text-xs">
            Saved to the history beside this form.{" "}
            <strong>Copy for email</strong> puts the formatted invoice on your
            clipboard — paste it straight into the body of an email.
          </p>
        </section>
      )}
    </div>
  );
}
