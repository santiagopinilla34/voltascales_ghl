"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { savePackages } from "@/app/(app)/business/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToInputValue, parsePriceToCents } from "@/lib/invoices/money";
import type { Package } from "@/types/database";

type Row = { name: string; description: string; price: string };

function toRows(packages: Package[]): Row[] {
  return packages.map((item) => ({
    name: item.name,
    description: item.description ?? "",
    price: centsToInputValue(item.price_cents),
  }));
}

/**
 * The offers list, edited as a whole and saved in one go.
 *
 * Local state rather than a save per row: reordering and renaming several
 * items is one edit in the user's head, and a row-at-a-time API would make a
 * half-finished list the normal state of the database.
 */
export function PackagesEditor({ packages }: { packages: Package[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(() => toRows(packages));

  const saved = toRows(packages);
  const dirty =
    rows.length !== saved.length ||
    rows.some(
      (row, index) =>
        row.name !== saved[index]?.name ||
        row.description !== saved[index]?.description ||
        row.price !== saved[index]?.price,
    );

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

      toast.success("Packages saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No packages yet. Add one and it becomes selectable on an invoice.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={index} className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <div className="grid flex-1 gap-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`package-name-${index}`}>Name</Label>
                      <Input
                        id={`package-name-${index}`}
                        value={row.name}
                        onChange={(event) =>
                          patch(index, { name: event.target.value })
                        }
                        placeholder="Website build"
                        disabled={pending}
                      />
                    </div>

                    <div className="grid gap-1.5">
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
                        className="tabular-nums"
                        disabled={pending}
                      />
                    </div>
                  </div>

                  <div className="grid gap-1.5">
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
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={pending || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${row.name || "package"} up`}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={pending || index === rows.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${row.name || "package"} down`}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive size-7"
                    disabled={pending}
                    onClick={() =>
                      setRows((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    aria-label={`Remove ${row.name || "package"}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
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

        <Button type="submit" size="sm" disabled={!dirty || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save packages
        </Button>

        {dirty && !pending && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setRows(toRows(packages))}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
