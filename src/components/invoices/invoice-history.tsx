"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Copy, Eye, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteInvoice } from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCents } from "@/lib/invoices/money";
import { formatFullTimestamp } from "@/lib/format";
import type { Invoice } from "@/types/database";

type Row = Pick<
  Invoice,
  "id" | "invoice_number" | "client_name" | "total_cents" | "created_at" | "html"
>;

/** What was sent, to whom, and when — with the exact document kept alongside. */
export function InvoiceHistory({ invoices }: { invoices: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [viewing, setViewing] = useState<Row | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  if (invoices.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
        No invoices yet. Generated ones are kept here.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y rounded-lg border">
        {invoices.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center gap-3 px-3 py-2.5"
          >
            <span className="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">
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

            <span className="shrink-0 text-sm tabular-nums">
              {formatCents(row.total_cents)}
            </span>

            <span className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => setViewing(row)}
                aria-label={`View invoice ${row.invoice_number}`}
              >
                <Eye className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => copy(row)}
                aria-label={`Copy invoice ${row.invoice_number}`}
              >
                {copiedId === row.id ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-destructive size-7"
                disabled={pending}
                onClick={() => remove(row)}
                aria-label={`Delete invoice ${row.invoice_number}`}
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            </span>
          </li>
        ))}
      </ul>

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
              className="h-[32rem] w-full rounded-lg border bg-white"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
