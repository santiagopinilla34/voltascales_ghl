"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Lightbulb,
  Loader2,
  Package as PackageIcon,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { savePackages } from "@/app/(app)/business/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  centsToInputValue,
  formatCents,
  parsePriceToCents,
} from "@/lib/invoices/money";
import type { Package } from "@/types/database";

type Row = { name: string; description: string; price: string };

/** Matches the fields on the Business details panel beside this one. */
const FIELD = "h-10";

function toRows(packages: Package[]): Row[] {
  return packages.map((item) => ({
    name: item.name,
    description: item.description ?? "",
    price: centsToInputValue(item.price_cents),
  }));
}

function sameRow(a: Row | undefined, b: Row | undefined): boolean {
  return (
    a?.name === b?.name &&
    a?.description === b?.description &&
    a?.price === b?.price
  );
}

/**
 * The offers list, edited as a whole and saved in one go.
 *
 * Local state rather than a save per row: reordering and renaming several
 * items is one edit in the user's head, and a row-at-a-time API would make a
 * half-finished list the normal state of the database.
 *
 * The list is always rendered in full, and says so. An editor that shows one
 * card and an "Add package" button looks identical whether you have one package
 * or the page is only rendering the first of five — so the count, the running
 * total and the per-row numbering are load-bearing, not decoration.
 */
export function PackagesEditor({ packages }: { packages: Package[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(() => toRows(packages));

  const saved = toRows(packages);

  // Re-derive from the server when the saved list actually changes — otherwise
  // `rows` is seeded once and never hears about a save, a revalidation or an
  // edit made in another tab, leaving the editor showing stale text while
  // claiming to be in sync. Only our own save changes this in practice, and by
  // then `rows` already matches, so nothing typed is at risk.
  const signature = JSON.stringify(saved);
  const [syncedTo, setSyncedTo] = useState(signature);
  if (signature !== syncedTo) {
    setSyncedTo(signature);
    setRows(saved);
  }

  const dirty =
    rows.length !== saved.length ||
    rows.some((row, index) => !sameRow(row, saved[index]));

  const savedTotal = packages.reduce((sum, item) => sum + item.price_cents, 0);

  function patch(index: number, next: Partial<Row>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...next } : row)),
    );
  }

  function move(index: number, delta: number) {
    setRows((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save(event: React.FormEvent) {
    event.preventDefault();

    const parsed: { name: string; description: string; priceCents: number }[] =
      [];

    for (const row of rows) {
      if (!row.name.trim()) {
        toast.error("Every package needs a name");
        return;
      }

      const priceCents = parsePriceToCents(row.price);
      if (priceCents === null) {
        toast.error(`"${row.name.trim()}" needs a valid price`, {
          description: "A number like 1499 or 1499.00.",
        });
        return;
      }

      parsed.push({
        name: row.name,
        description: row.description,
        priceCents,
      });
    }

    startTransition(async () => {
      const result = await savePackages(parsed);

      if (!result.ok) {
        toast.error("Could not save packages", { description: result.error });
        return;
      }

      toast.success(
        parsed.length === 1 ? "1 package saved" : `${parsed.length} packages saved`,
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex min-w-0 flex-col gap-6">
      {/* What is actually in the database, stated plainly. This is the line
          that answers "is my list all here?" without counting cards. */}
      <div className="bg-muted/40 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm">
        <span className="font-medium">
          {packages.length === 0
            ? "No packages saved"
            : packages.length === 1
              ? "1 package saved"
              : `${packages.length} packages saved`}
        </span>

        {dirty && (
          <Badge
            variant="outline"
            className="border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-400"
          >
            Unsaved changes
          </Badge>
        )}

        {packages.length > 0 && (
          <span className="ml-auto tabular-nums">
            <span className="font-medium text-emerald-500">
              {formatCents(savedTotal)}
            </span>{" "}
            <span className="text-muted-foreground">total</span>
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No packages yet. Add one and it becomes selectable on an invoice.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => {
            const savedRow = saved[index];
            const isNew = index >= saved.length;
            const isEdited = !isNew && !sameRow(row, savedRow);

            return (
              <li
                key={index}
                className="bg-muted/20 flex min-w-0 items-start gap-3 rounded-lg border p-4"
              >
                {/* Position in the list, and whether this row differs from
                    what is stored. Stacked here rather than in a header strip
                    so the fields keep the full width of the card. */}
                <div className="flex shrink-0 flex-col items-center gap-1.5 pt-1">
                  <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-medium tabular-nums text-emerald-400">
                    {index + 1}
                  </span>
                  {isNew && (
                    <Badge variant="secondary" className="text-[10px]">
                      New
                    </Badge>
                  )}
                  {isEdited && (
                    <Badge variant="outline" className="text-[10px]">
                      Edited
                    </Badge>
                  )}
                </div>

                <span
                  className="bg-background flex size-11 shrink-0 items-center justify-center rounded-lg border"
                  aria-hidden
                >
                  <PackageIcon className="text-muted-foreground size-5" />
                </span>

                <div className="grid min-w-0 flex-1 gap-3">
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                    <div className="grid min-w-0 gap-1.5">
                      <Label htmlFor={`package-name-${index}`}>Name</Label>
                      <Input
                        id={`package-name-${index}`}
                        value={row.name}
                        onChange={(event) =>
                          patch(index, { name: event.target.value })
                        }
                        placeholder="Website build"
                        disabled={pending}
                        className={FIELD}
                      />
                    </div>

                    <div className="grid min-w-0 gap-1.5">
                      <Label htmlFor={`package-price-${index}`}>
                        Price (CAD)
                      </Label>
                      <Input
                        id={`package-price-${index}`}
                        value={row.price}
                        onChange={(event) =>
                          patch(index, { price: event.target.value })
                        }
                        placeholder="1499.00"
                        inputMode="decimal"
                        className={`${FIELD} tabular-nums`}
                        disabled={pending}
                      />
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-1.5">
                    <Label htmlFor={`package-description-${index}`}>
                      Description (optional)
                    </Label>
                    <Input
                      id={`package-description-${index}`}
                      value={row.description}
                      onChange={(event) =>
                        patch(index, { description: event.target.value })
                      }
                      placeholder="5 pages, mobile-ready, contact form"
                      disabled={pending}
                      className={FIELD}
                    />
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    disabled={pending || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${row.name || "package"} up`}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    disabled={pending || index === rows.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${row.name || "package"} down`}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive size-8"
                    disabled={pending}
                    onClick={() =>
                      setRows((current) => current.filter((_, i) => i !== index))
                    }
                    aria-label={`Remove ${row.name || "package"}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="h-10 gap-2 px-4 text-emerald-500"
          onClick={() =>
            setRows((current) => [
              ...current,
              { name: "", description: "", price: "" },
            ])
          }
        >
          <Plus className="size-4" />
          Add package
        </Button>

        <Button
          type="submit"
          variant="outline"
          disabled={!dirty || pending}
          className="h-10 gap-2 px-4"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save packages
        </Button>

        {dirty && !pending && (
          <Button
            type="button"
            variant="ghost"
            className="h-10 px-4"
            onClick={() => setRows(saved)}
          >
            Cancel
          </Button>
        )}
      </div>

      {/* What this list is for, said once. The packages editor is the only
          place in the app where you build something you never see here — the
          payoff is a click on the invoice form two pages away. */}
      <div className="bg-muted/20 flex gap-3 rounded-lg border p-4">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">How packages work</p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Create and save the products or services you offer. They&rsquo;ll be
            available when creating invoices so you can add them with a click.
          </p>
        </div>
      </div>
    </form>
  );
}
