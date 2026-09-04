"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Copy, Eye, Loader2, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteInvoice } from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCents } from "@/lib/invoices/money";
import { formatFullTimestamp } from "@/lib/format";
import type { Invoice } from "@/types/database";

type Row = Pick<
  Invoice,
  "id" | "invoice_number" | "client_name" | "total_cents" | "created_at" | "html"
>;

/** How the list is ordered. Newest first is what you want right after sending. */
type Sort = "newest" | "oldest" | "largest";

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "largest", label: "Largest first" },
];

/** What was sent, to whom, and when — with the exact document kept alongside. */
export function InvoiceHistory({ invoices }: { invoices: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [viewing, setViewing] = useState<Row | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("newest");

  // The server hands these back newest first, so that order costs nothing and
  // the other two are a copy away from it.
  const rows = useMemo(() => {
    if (sort === "newest") return invoices;
    if (sort === "oldest") return [...invoices].reverse();
    return [...invoices].sort((a, b) => b.total_cents - a.total_cents);
  }, [invoices, sort]);

  async function copy(row: Row) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([row.html], { type: "text/html" }),
          "text/plain": new Blob([row.html], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(row.html);
    }

    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function remove(row: Row) {
    startTransition(async () => {
      const result = await deleteInvoice(row.id);

      if (!result.ok) {
        toast.error("Could not delete", { description: result.error });
        return;
      }
      toast.success(`Invoice #${row.invoice_number} deleted`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">
              Invoice history
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Every invoice generated, exactly as it was sent.
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Sort invoices"
              >
                <SlidersHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(value) => setSort(value as Sort)}
              >
                {SORTS.map((entry) => (
                  <DropdownMenuRadioItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {rows.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            No invoices yet. Generated ones are kept here.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((row) => (
              <li
                key={row.id}
                className="bg-muted/30 flex flex-wrap items-center gap-3 rounded-lg border p-4"
              >
                <span className="text-muted-foreground w-8 shrink-0 text-xs tabular-nums">
                  #{row.invoice_number}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {row.client_name}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {formatFullTimestamp(row.created_at)}
                  </span>
                </span>

                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatCents(row.total_cents)}
                </span>

                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => setViewing(row)}
                    aria-label={`View invoice ${row.invoice_number}`}
                  >
                    <Eye className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => copy(row)}
                    aria-label={`Copy invoice ${row.invoice_number}`}
                  >
                    {copiedId === row.id ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive size-8"
                    disabled={pending}
                    onClick={() => remove(row)}
                    aria-label={`Delete invoice ${row.invoice_number}`}
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={viewing !== null} onOpenChange={() => setViewing(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Invoice #{viewing?.invoice_number} — {viewing?.client_name}
            </DialogTitle>
          </DialogHeader>

          {/* The stored HTML, verbatim — this is the record of what was sent,
              not a re-render from current data. */}
          {viewing && (
            <iframe
              title={`Invoice ${viewing.invoice_number}`}
              srcDoc={viewing.html}
              className="h-[22rem] w-full rounded-lg border bg-white sm:h-[32rem]"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
