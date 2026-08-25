"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createKnowledgeBase,
  renameKnowledgeBase,
} from "@/app/(app)/ai-agents/knowledge-base/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DESCRIPTION_MAX, NAME_MAX } from "@/lib/knowledge/bases";
import type { KnowledgeBase } from "@/types/database";

/**
 * Making a knowledge base, or editing what one is called.
 *
 * One component for both because the fields are the same two, and two dialogs
 * that drift apart is how a base ends up renameable to something it could not
 * have been created as.
 *
 * Two fields and nothing else. Naming a base is not the interesting part of
 * making one — what goes in it is — so this gets out of the way and hands you
 * over to the base itself, which is why creating navigates rather than
 * dropping a new row into the list for you to find and click.
 *
 * The taken-name check is done here as well as by the unique index. The index
 * is what makes it true; this is what makes it visible before you have typed a
 * description you are about to lose.
 */

export function KnowledgeBaseDialog({
  open,
  onOpenChange,
  existing,
  base,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every base already on the account, for the taken-name check. */
  existing: KnowledgeBase[];
  /** Editing this one, or creating a new one when absent. */
  base?: KnowledgeBase;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const editing = Boolean(base);

  const [name, setName] = useState(base?.name ?? "");
  const [description, setDescription] = useState(base?.description ?? "");

  const takenNames = new Set(
    existing
      .filter((item) => item.id !== base?.id)
      .map((item) => item.name.trim().toLowerCase()),
  );

  const trimmed = name.trim();
  const taken = trimmed.length > 0 && takenNames.has(trimmed.toLowerCase());

  function reset() {
    setName(base?.name ?? "");
    setDescription(base?.description ?? "");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      if (base) {
        const result = await renameKnowledgeBase(base.id, {
          name,
          description,
        });

        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        toast.success("Knowledge base updated");
        onOpenChange(false);
        // The action revalidates the path; this is what makes the open page
        // pick that up without a reload.
        router.refresh();
        return;
      }

      const result = await createKnowledgeBase({ name, description });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onOpenChange(false);
      reset();
      // Straight into the base rather than back to the list. A base you have
      // just named is empty, and the next thing you want is the screen that
      // lets you put something in it.
      router.push(`/ai-agents/knowledge-base/${result.value.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit knowledge base" : "Create knowledge base"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "What it is called, and what belongs in it."
              : "Give your knowledge base a name."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kb-name" className="text-xs">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="kb-name"
              value={name}
              maxLength={NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter knowledge base name"
              aria-invalid={taken || undefined}
              autoFocus
            />
            {taken && (
              <p className="text-destructive text-xs">
                There&apos;s already a knowledge base with that name.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kb-description" className="text-xs">
              Description{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="kb-description"
              value={description}
              maxLength={DESCRIPTION_MAX}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What belongs in here, so the next person knows which base to edit."
              rows={4}
            />
            <p className="text-muted-foreground self-end text-xs tabular-nums">
              {description.length} / {DESCRIPTION_MAX}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending || !trimmed || taken}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
