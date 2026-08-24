"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, Plus } from "lucide-react";
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
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  STARTER_BASES,
  type StarterBase,
} from "@/lib/knowledge/bases";
import type { KnowledgeBase } from "@/types/database";
import { cn } from "@/lib/utils";

/**
 * Making a knowledge base, or renaming one.
 *
 * One component for both because the fields are the same two, and two dialogs
 * that drift apart is how a base ends up renameable to something it could not
 * have been created as.
 *
 * The difference is the list at the top, which only creating gets. An empty
 * knowledge base screen is a blank-page problem — everyone agrees the agent
 * should know things and nobody knows what the first thing is — so the
 * starters answer "what do I make first" with a list rather than a blinking
 * cursor. Picking one only fills the fields in; what gets created is an
 * ordinary base, and nothing about it remembers which starter it came from.
 *
 * A starter whose name is already taken is shown as taken rather than hidden.
 * Hiding it invites making it again under a slightly different name, which is
 * the outcome the unique index exists to prevent.
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
  /** Renaming this one, or creating a new one when absent. */
  base?: KnowledgeBase;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const renaming = Boolean(base);

  const [name, setName] = useState(base?.name ?? "");
  const [description, setDescription] = useState(base?.description ?? "");
  const [starter, setStarter] = useState<string | null>(null);

  const takenNames = new Set(
    existing
      .filter((item) => item.id !== base?.id)
      .map((item) => item.name.trim().toLowerCase()),
  );

  function reset() {
    setName(base?.name ?? "");
    setDescription(base?.description ?? "");
    setStarter(null);
  }

  function choose(option: StarterBase) {
    setStarter(option.key);
    setName(option.name);
    setDescription(option.description);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const result = base
        ? await renameKnowledgeBase(base.id, { name, description })
        : await createKnowledgeBase({ name, description });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(renaming ? "Knowledge base updated" : "Knowledge base created");
      onOpenChange(false);
      reset();
      // The action revalidates the path; this is what makes the open page pick
      // that up without a reload.
      router.refresh();
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
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {renaming ? "Edit knowledge base" : "New knowledge base"}
          </DialogTitle>
          <DialogDescription>
            {renaming
              ? "What it is called, and what belongs in it."
              : "A named set of facts your agents are allowed to answer from."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {!renaming && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Start from</Label>

              <div className="flex flex-col gap-1.5">
                {STARTER_BASES.map((option) => {
                  const taken = takenNames.has(option.name.toLowerCase());
                  const selected = starter === option.key;

                  return (
                    <button
                      key={option.key}
                      type="button"
                      disabled={taken}
                      onClick={() => choose(option)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                        taken
                          ? "cursor-not-allowed opacity-50"
                          : "hover:bg-accent",
                        selected && "border-foreground bg-accent",
                      )}
                    >
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                        {selected && <Check className="size-3.5" />}
                      </span>

                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                          {option.name}
                          {taken && (
                            <span className="text-muted-foreground font-normal">
                              — already added
                            </span>
                          )}
                        </span>
                        <span className="text-muted-foreground text-[0.6875rem] leading-relaxed">
                          {option.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-muted-foreground text-[0.6875rem]">
                Or ignore these and write your own below — a starter only fills
                in the name and description.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kb-name" className="text-xs">
              Name
            </Label>
            <Input
              id="kb-name"
              value={name}
              maxLength={NAME_MAX}
              onChange={(event) => {
                setName(event.target.value);
                // Typing over a starter's name means it is no longer that
                // starter, and the tick should stop claiming otherwise.
                setStarter(null);
              }}
              placeholder="Pricing and packages"
              autoFocus={renaming}
            />
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
              rows={2}
            />
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
            <Button type="submit" size="sm" disabled={pending || !name.trim()}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : renaming ? (
                <Check className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              {renaming ? "Save changes" : "Create knowledge base"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
