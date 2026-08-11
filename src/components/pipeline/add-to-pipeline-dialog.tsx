"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { addToPipeline } from "@/app/(app)/pipeline/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { contactLabel, formatPhone } from "@/lib/format";
import type { Contact } from "@/types/database";

type Candidate = Pick<Contact, "id" | "name" | "phone" | "business_name">;

/**
 * Picks a contact to put on the board.
 *
 * The list is pre-filtered server-side to contacts not already on the pipeline,
 * so every row here is a valid choice — the unique constraint can't be hit by
 * clicking something the dialog offered.
 */
export function AddToPipelineDialog({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

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
    startTransition(async () => {
      const result = await addToPipeline(contact.id);

      if (!result.ok) {
        toast.error("Could not add to the pipeline", {
          description: result.error,
        });
        return;
      }

      setOpen(false);
      setQuery("");
      toast.success(`${contactLabel(contact)} added to Interested`);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={candidates.length === 0}>
          <Plus className="size-4" />
          Add to pipeline
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a contact to the pipeline</DialogTitle>
          <DialogDescription>
            They land in <strong>Interested</strong>. Drag the card, or use its
            menu, to move it from there.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, business or number"
            autoComplete="off"
            disabled={pending}
            aria-label="Search contacts"
          />

          <div className="max-h-72 overflow-y-auto rounded-md border">
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
                      disabled={pending}
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
      </DialogContent>
    </Dialog>
  );
}
