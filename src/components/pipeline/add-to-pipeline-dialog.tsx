"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { addToPipeline } from "@/app/(app)/pipeline/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contactLabel, formatPhone, parseMoneyToCents } from "@/lib/format";
import type { Contact } from "@/types/database";

type Candidate = Pick<Contact, "id" | "name" | "phone" | "business_name">;

/**
 * Picks a contact to put on the board.
 *
 * The list is pre-filtered server-side to contacts not already on the pipeline,
 * so every row here is a valid choice — the unique constraint can't be hit by
 * clicking something the dialog offered.
 *
 * Controlled, and with no trigger of its own: the board opens it from three
 * places — the toolbar button, the split menu, and the "Add deal" foot of each
 * column — and only the last of those knows which stage the card should land
 * in. One dialog told where to put things beats three dialogs.
 */
export function AddToPipelineDialog({
  candidates,
  pipelineId,
  stage,
  open,
  onOpenChange,
}: {
  candidates: Candidate[];
  pipelineId: string;
  /** The stage's name. It is already the label — there is nothing to look up. */
  stage: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  // Parsed on every keystroke so the field can refuse before the click rather
  // than after the round trip. Null is "that is not a number"; an empty box is
  // a deal nobody has priced, which is a valid zero.
  const valueCents = parseMoneyToCents(value);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates.slice(0, 50);

    return candidates
      .filter((contact) =>
        [contact.name, contact.business_name, contact.phone]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(needle)),
      )
      .slice(0, 50);
  }, [candidates, query]);

  function add(contact: Candidate) {
    if (valueCents === null) return;

    startTransition(async () => {
      const result = await addToPipeline(
        contact.id,
        pipelineId,
        stage,
        valueCents,
      );

      if (!result.ok) {
        toast.error("Could not add to the pipeline", {
          description: result.error,
        });
        return;
      }

      onOpenChange(false);
      setQuery("");
      setValue("");
      toast.success(`${contactLabel(contact)} added to ${stage}`);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
          setValue("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a contact to the pipeline</DialogTitle>
          <DialogDescription>
            They land in <strong>{stage}</strong>. Drag the card, or use its
            menu, to move it from there.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Above the contact list rather than below it, because picking a
              contact is what submits — a value field under the list would be
              one nobody ever reaches in time to fill. */}
          <div className="grid gap-2">
            <Label htmlFor="deal-value">Deal value</Label>
            <div className="relative">
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                CA$
              </span>
              <Input
                id="deal-value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                // `decimal` rather than `numeric`: it is the keypad with a
                // separator on it, and money has cents.
                inputMode="decimal"
                placeholder="0"
                autoComplete="off"
                disabled={pending}
                aria-invalid={valueCents === null}
                className="pl-12"
              />
            </div>
            <p
              className={
                valueCents === null
                  ? "text-destructive text-xs"
                  : "text-muted-foreground text-xs"
              }
            >
              {valueCents === null
                ? "Amounts only — digits, and cents if you need them."
                : "What it is worth if it closes. The stage total adds these up; leave it empty if you don't know yet."}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-search">Contact</Label>
            <Input
              id="contact-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, business or number"
              autoComplete="off"
              disabled={pending}
            />

            <div className="max-h-64 overflow-y-auto rounded-md border">
              {matches.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center text-sm">
                  {candidates.length === 0
                    ? "Every contact is already on the pipeline."
                    : "No contact matches that."}
                </p>
              ) : (
                <ul className="divide-y">
                  {matches.map((contact) => (
                    <li key={contact.id}>
                      <button
                        type="button"
                        onClick={() => add(contact)}
                        disabled={pending || valueCents === null}
                        className="hover:bg-muted/60 focus-visible:bg-muted/60 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors focus-visible:outline-none disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {contactLabel(contact)}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {contact.business_name
                              ? `${contact.business_name} · ${formatPhone(contact.phone)}`
                              : formatPhone(contact.phone)}
                          </span>
                        </span>
                        {pending && <Loader2 className="size-4 animate-spin" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
