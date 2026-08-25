"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BOT_CHANNELS,
  BOT_KIND_LABELS,
  BOT_MODES,
  DESCRIPTION_MAX,
  NAME_MAX,
  type BotChannel,
  type BotKind,
  type BotMode,
  type ConversationBot,
} from "@/lib/ai-agents/bots";

/**
 * Making a chatbot, or editing what one is.
 *
 * One component for both, for the same reason the knowledge base dialog is:
 * the fields are the same four, and two dialogs that drift apart is how a bot
 * ends up editable into something it could not have been created as.
 *
 * Four fields and no more. What the bot actually *says* — its prompt, its
 * knowledge base, when it gives up and fetches a human — is a screen of its
 * own, not a field in a create dialog. This asks only what the list has to
 * show, and the taken-name check happens here so you find out before writing
 * a description you are about to lose.
 */

export type BotDraft = {
  name: string;
  description: string;
  mode: BotMode;
  channels: BotChannel[];
};

export function BotDialog({
  open,
  onOpenChange,
  onSubmit,
  existing,
  bot,
  kind,
  onBack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Given a validated draft. Closing is the caller's business. */
  onSubmit: (draft: BotDraft) => void;
  /** Every bot already on the account, for the taken-name check. */
  existing: ConversationBot[];
  /** Editing this one, or creating a new one when absent. */
  bot?: ConversationBot;
  /** The kind chosen in the step before this one. Required when creating. */
  kind?: BotKind;
  /** Back to that step. Absent when editing, where there is no step before. */
  onBack?: () => void;
}) {
  const editing = Boolean(bot);
  // When editing, the kind is the bot's own and is not up for discussion.
  const shownKind = bot?.kind ?? kind;

  const [name, setName] = useState(bot?.name ?? "");
  const [description, setDescription] = useState(bot?.description ?? "");
  const [mode, setMode] = useState<BotMode>(bot?.mode ?? "suggest");
  const [channels, setChannels] = useState<BotChannel[]>(bot?.channels ?? []);

  const takenNames = new Set(
    existing
      .filter((item) => item.id !== bot?.id)
      .map((item) => item.name.trim().toLowerCase()),
  );

  const trimmed = name.trim();
  const taken = trimmed.length > 0 && takenNames.has(trimmed.toLowerCase());

  function toggleChannel(channel: BotChannel, on: boolean) {
    setChannels((current) =>
      on
        ? [...current, channel]
        : current.filter((value) => value !== channel),
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || taken) return;

    onSubmit({ name: trimmed, description: description.trim(), mode, channels });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {editing ? "Edit bot" : "Create bot"}
            {/* The kind is settled by now — shown, not offered. On the create
                form it is the receipt for the step you just came through; on
                the edit form it is the answer to "which of these is this
                one?", which the list can only afford a badge for. */}
            {shownKind && (
              <Badge variant="secondary">{BOT_KIND_LABELS[shownKind]}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "What it is called, where it works, and how much it may do alone."
              : "Name the bot and say where it works. What it says comes next."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bot-name" className="text-xs">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bot-name"
              value={name}
              maxLength={NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              placeholder="Front desk"
              aria-invalid={taken || undefined}
              autoFocus
            />
            {taken && (
              <p className="text-destructive text-xs">
                There&apos;s already a bot with that name.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bot-description" className="text-xs">
              Description{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="bot-description"
              value={description}
              maxLength={DESCRIPTION_MAX}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Which conversations this one is for, so the next person knows which bot to edit."
              rows={3}
            />
            <p className="text-muted-foreground self-end text-xs tabular-nums">
              {description.length} / {DESCRIPTION_MAX}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bot-mode" className="text-xs">
              How much it does on its own
            </Label>
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as BotMode)}
            >
              <SelectTrigger id="bot-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOT_MODES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {BOT_MODES.find((option) => option.value === mode)?.hint}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Channels</Label>
            {/* Checkboxes rather than a multi-select: there are six, they all
                fit, and seeing which are off is as much the point as seeing
                which are on. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {BOT_CHANNELS.map((channel) => (
                <Label
                  key={channel.value}
                  className="flex items-center gap-2 text-xs font-normal"
                >
                  <Checkbox
                    checked={channels.includes(channel.value)}
                    onCheckedChange={(checked) =>
                      toggleChannel(channel.value, checked === true)
                    }
                  />
                  {channel.label}
                </Label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              A bot with no channels is saved but idle — nothing reaches it.
            </p>
          </div>

          <DialogFooter>
            {onBack && (
              // `sm:mr-auto` pins it to the far left on a wide dialog, away
              // from the two buttons that commit or discard: it goes back a
              // step, which is neither.
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="sm:mr-auto"
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!trimmed || taken}>
              {editing ? "Save changes" : "Create bot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
