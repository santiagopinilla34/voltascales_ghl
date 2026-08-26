"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TRIGGER_BASES_MAX,
  TRIGGER_INSTRUCTIONS_MAX,
  type KnowledgeTrigger,
} from "@/lib/ai-agents/bots";
import type { KnowledgeBase } from "@/types/database";

/**
 * Adding a trigger, or editing one.
 *
 * Two fields, and only the first is required. The instruction is where people
 * expect to write a prompt, so the note under it says plainly what happens
 * when it is left empty — the agent still decides for itself — rather than
 * implying the box is what makes the trigger work.
 *
 * The bases are the account's real ones, read on the server and passed down.
 * A picker offering names nobody made would be the one part of this screen
 * that could not be checked against anything.
 */
export function TriggerDialog({
  open,
  onOpenChange,
  onSubmit,
  bases,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (trigger: KnowledgeTrigger) => void;
  /** Every knowledge base on the account. */
  bases: KnowledgeBase[];
  /** Editing this one, or adding a new one when absent. */
  trigger?: KnowledgeTrigger;
}) {
  const [baseIds, setBaseIds] = useState<string[]>(trigger?.base_ids ?? []);
  const [instructions, setInstructions] = useState(
    trigger?.instructions ?? "",
  );

  const full = baseIds.length >= TRIGGER_BASES_MAX;

  function toggle(id: string, on: boolean) {
    setBaseIds((current) => {
      if (!on) return current.filter((item) => item !== id);
      if (current.length >= TRIGGER_BASES_MAX) return current;
      return [...current, id];
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (baseIds.length === 0) return;

    onSubmit({
      id: trigger?.id ?? crypto.randomUUID(),
      base_ids: baseIds,
      instructions: instructions.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{trigger ? "Edit trigger" : "Add trigger"}</DialogTitle>
          <DialogDescription>
            Which knowledge bases this rule reaches for, and when.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              Knowledge bases <span className="text-destructive">*</span>
            </Label>

            {bases.length === 0 ? (
              // Nothing to pick, so the picker would be an empty menu and a
              // dead end. Says why, and where to go instead.
              <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-xs">
                There are no knowledge bases on this account yet. Make one
                first, then come back and point a trigger at it.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border p-1.5">
                  {baseIds.length === 0 && (
                    <span className="text-muted-foreground px-1.5 text-xs">
                      None selected
                    </span>
                  )}

                  {/* Ordered by the account's own list rather than by when
                      each was ticked, so the chips do not reshuffle as you
                      use the menu. */}
                  {bases
                    .filter((base) => baseIds.includes(base.id))
                    .map((base) => (
                      <Badge
                        key={base.id}
                        variant="outline"
                        className="max-w-56 gap-1 pr-1"
                      >
                        <span className="truncate">{base.name}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${base.name}`}
                          onClick={() => toggle(base.id, false)}
                          className="hover:text-foreground text-muted-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="xs" className="ml-auto">
                        Choose
                        <ChevronDown className="size-3" />
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end" className="w-56">
                      {bases.map((base) => {
                        const checked = baseIds.includes(base.id);

                        return (
                          <DropdownMenuCheckboxItem
                            key={base.id}
                            checked={checked}
                            // At the cap the unticked ones stop responding
                            // rather than disappearing, so the limit reads as
                            // a rule instead of a list that shrank.
                            disabled={!checked && full}
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={(next) => toggle(base.id, next)}
                          >
                            <span className="truncate">{base.name}</span>
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="text-muted-foreground text-xs">
                  Up to {TRIGGER_BASES_MAX}. {baseIds.length} chosen.
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trigger-instructions" className="text-xs">
              When to use them{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="trigger-instructions"
              value={instructions}
              maxLength={TRIGGER_INSTRUCTIONS_MAX}
              rows={4}
              placeholder="When the customer asks about pricing"
              onChange={(event) => setInstructions(event.target.value)}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Leave it blank and the agent decides on its own when these bases
              are relevant. Filling it in is a nudge, not a switch.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={baseIds.length === 0}>
              {trigger ? "Save changes" : "Add trigger"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
