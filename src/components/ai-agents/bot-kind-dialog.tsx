"use client";

import { Check, Clock, SlidersHorizontal, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BOT_KINDS, type BotKind } from "@/lib/ai-agents/bots";
import { cn } from "@/lib/utils";

/**
 * Which kind of bot, asked before anything else.
 *
 * A step in front of the create form rather than a field inside it, because
 * this is the one choice on a bot that cannot be changed afterwards — a prompt
 * is a paragraph, a flow is a graph, and there is no conversion between them.
 * A radio buried under Name would read like a preference; two cards you have
 * to pick between read like the decision it is.
 *
 * The flow card is shown and refused rather than left out. Only one kind can
 * actually be made today, which makes this a chooser with one choice — but a
 * chooser that admits the other is coming lets someone decide to wait, and
 * that is exactly the decision a missing card would make for them. The button
 * says what it is instead of being a dead "Create new bot": a disabled button
 * with the same label as its neighbour reads as a bug.
 */

const ICONS: Record<BotKind, LucideIcon> = {
  prompt: SlidersHorizontal,
  flow: Workflow,
};

export function BotKindDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Given the chosen kind. Opening the form next is the caller's business. */
  onPick: (kind: BotKind) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create new bot</DialogTitle>
          <DialogDescription>
            How you want to write this one. It cannot be changed later.
          </DialogDescription>
        </DialogHeader>

        {/* Side by side above `sm`, stacked below. Two cards is the whole
            point — the choice is a comparison, and a single column asks you
            to hold the first one in your head while reading the second. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {BOT_KINDS.map((kind) => {
            const Icon = ICONS[kind.value];

            return (
              <div
                key={kind.value}
                // Dimmed rather than greyed out entirely: the text is the
                // point of an unavailable card, so it has to stay readable.
                // The disabled button is what says no.
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-4",
                  kind.comingSoon && "bg-muted/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
                    <Icon className="size-4" />
                  </span>

                  {kind.comingSoon && (
                    <Badge variant="outline" className="text-muted-foreground">
                      <Clock />
                      Coming soon
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-medium">{kind.label}</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {kind.summary}
                  </p>
                </div>

                <ul className="flex flex-col gap-1.5">
                  {kind.points.map((point) => (
                    <li
                      key={point}
                      className="text-muted-foreground flex items-start gap-2 text-xs"
                    >
                      <Check className="mt-0.5 size-3 shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>

                {/* `mt-auto` so both buttons sit on the same line however
                    uneven the two lists are — the cards are meant to be read
                    against each other, and a button that floats up with the
                    shorter list makes the pair look misaligned rather than
                    comparable. */}
                <p className="text-muted-foreground mt-auto pt-1 text-xs leading-relaxed">
                  {kind.recommendation}
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={kind.comingSoon}
                  onClick={() => onPick(kind.value)}
                >
                  {kind.comingSoon ? "Not available yet" : "Create new bot"}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
