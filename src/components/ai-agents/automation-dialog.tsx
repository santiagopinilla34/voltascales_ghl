"use client";

import { useState } from "react";
import { ChevronDown, Plus, Trash2, Workflow, X } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AUTOMATION_NAME_MAX,
  AUTOMATION_WHEN_MAX,
  automationProblem,
  newAutomationTrigger,
  triggerIsBlank,
  triggerLabel,
  type AutomationOption,
  type AutomationTrigger,
} from "@/lib/ai-agents/bots";
import { cn } from "@/lib/utils";

/**
 * Setting up the automation action.
 *
 * One condition per entry, and whichever automations it starts. A rail of
 * entries beside one form, rather than a stack of expanding cards, because a
 * bot worth giving this action usually gets several — start the refund flow
 * when they ask for a refund, start the nurture flow when they go cold — and a
 * stack makes you scroll past four you are not editing to reach the fifth.
 *
 * The automations are the account's real ones, read on the server and passed
 * down. Only the entries themselves are front end only — there is no table
 * behind them yet.
 */
export function AutomationDialog({
  open,
  onOpenChange,
  triggers,
  onSave,
  onRemove,
  automations = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The entries as saved. The dialog edits a copy. */
  triggers: AutomationTrigger[];
  onSave: (triggers: AutomationTrigger[]) => void;
  /** Take the automation action off this bot entirely. */
  onRemove: () => void;
  automations?: AutomationOption[];
}) {
  return (
    // Keyed on `open` so each opening starts from what was saved rather than
    // from whatever was abandoned last time — Cancel is supposed to mean it.
    <Dialog key={String(open)} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
              <Workflow className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle>Start an automation</DialogTitle>
              <DialogDescription className="text-xs">
                One condition per entry, and the automations it starts.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <AutomationForm
          triggers={triggers}
          onSave={onSave}
          onRemove={onRemove}
          onCancel={() => onOpenChange(false)}
          automations={automations}
        />
      </DialogContent>
    </Dialog>
  );
}

function AutomationForm({
  triggers,
  onSave,
  onRemove,
  onCancel,
  automations,
}: {
  triggers: AutomationTrigger[];
  onSave: (triggers: AutomationTrigger[]) => void;
  onRemove: () => void;
  onCancel: () => void;
  automations: AutomationOption[];
}) {
  // Opening on an action with nothing on it starts you on a blank entry rather
  // than on an empty pane and a button. There is nothing to look at here until
  // an entry exists, so making you ask for the first one is a click that buys
  // nothing.
  const [draft, setDraft] = useState<AutomationTrigger[]>(() =>
    triggers.length > 0 ? triggers : [newAutomationTrigger()],
  );
  const [activeId, setActiveId] = useState(() => draft[0].id);

  const active = draft.find((trigger) => trigger.id === activeId) ?? draft[0];

  function patch(changes: Partial<AutomationTrigger>) {
    setDraft((current) =>
      current.map((trigger) =>
        trigger.id === active.id ? { ...trigger, ...changes } : trigger,
      ),
    );
  }

  function add() {
    const created = newAutomationTrigger();
    setDraft((current) => [...current, created]);
    setActiveId(created.id);
  }

  function remove() {
    // The last entry going is the action going: an automation action with
    // nothing on it fires on nothing, and leaving it on the bot to say so is
    // worse than taking it off.
    if (draft.length === 1) {
      onRemove();
      return;
    }

    const index = draft.findIndex((trigger) => trigger.id === active.id);
    const rest = draft.filter((trigger) => trigger.id !== active.id);

    setDraft(rest);
    setActiveId(rest[Math.min(index, rest.length - 1)].id);
  }

  const problem = automationProblem(draft, automations);

  // Nothing typed or chosen anywhere yet, so there is nothing to be wrong
  // about. Save is still off; a form that greets you in red is one people
  // learn to ignore before they have done anything.
  const untouched = draft.length === 1 && triggerIsBlank(draft[0]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
        {/* The rail. Whatever the entry is called — your name for it, or the
            automation's — because that is what you are scanning for when you
            come back to edit one. */}
        <ol className="flex max-h-[45vh] flex-col gap-0.5 overflow-y-auto sm:border-r sm:pr-2">
          {draft.map((trigger) => (
            <li key={trigger.id}>
              <button
                type="button"
                onClick={() => setActiveId(trigger.id)}
                className={cn(
                  "hover:bg-muted/50 w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  trigger.id === active.id
                    ? "bg-muted font-medium"
                    : "text-muted-foreground",
                )}
              >
                {triggerLabel(trigger, automations)}
              </button>
            </li>
          ))}
        </ol>

        <div className="flex max-h-[45vh] flex-col gap-4 overflow-x-hidden overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              Automations to start <span className="text-destructive">*</span>
            </Label>

            <AutomationPicker
              value={active.automation_ids}
              onChange={(automation_ids) => patch({ automation_ids })}
              automations={automations}
            />

            <p className="text-muted-foreground text-xs leading-relaxed">
              Every one of these runs when the condition below is met.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="automation-when" className="text-xs">
              When to start them <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="automation-when"
              value={active.when}
              maxLength={AUTOMATION_WHEN_MAX}
              rows={4}
              placeholder="The customer agrees to pay for the subscription"
              onChange={(event) => patch({ when: event.target.value })}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              The bot judges this against the conversation, so describe the
              situation rather than naming a keyword.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="automation-name" className="text-xs">
              Name this entry{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="automation-name"
              value={active.name}
              maxLength={AUTOMATION_NAME_MAX}
              placeholder={triggerLabel(
                { ...active, name: "" },
                automations,
              )}
              onChange={(event) => patch({ name: event.target.value })}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Only you see this. Worth filling in when an entry starts several
              automations, or when the same one runs off two conditions.
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={remove}
            className="text-destructive hover:text-destructive self-start"
          >
            <Trash2 />
            {draft.length === 1 ? "Remove the action" : "Delete this entry"}
          </Button>
        </div>
      </div>

      {/* The same sentence Save is blocked by, from the same function. */}
      {problem && !untouched && (
        <p className="text-destructive text-xs">{problem}</p>
      )}

      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={add}
          className="sm:mr-auto"
        >
          <Plus />
          New automation
        </Button>

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={problem !== null}
            onClick={() => onSave(draft)}
          >
            Save
          </Button>
        </div>
      </DialogFooter>
    </div>
  );
}

/**
 * Which automations one entry starts.
 *
 * A multi-select, because two flows off one condition is the ordinary case —
 * tag the contact and send the email — and making that two entries with the
 * same sentence in both is how the sentences drift apart.
 */
function AutomationPicker({
  value,
  onChange,
  automations,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  automations: AutomationOption[];
}) {
  if (automations.length === 0) {
    // Nothing to pick, so a menu would open onto nothing. Says why, and where
    // to go instead — the same shape the knowledge-base trigger dialog uses.
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2.5 text-xs leading-relaxed">
        There are no automations on this account yet. Build one under
        Automations, then come back and point an entry at it.
      </p>
    );
  }

  function toggle(id: string, on: boolean) {
    onChange(on ? [...value, id] : value.filter((item) => item !== id));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border p-1.5">
      {value.length === 0 && (
        <span className="text-muted-foreground px-1.5 text-xs">
          None selected
        </span>
      )}

      {/* Ordered by the account's own list rather than by when each was
          ticked, so the chips do not reshuffle as you use the menu. */}
      {automations
        .filter((automation) => value.includes(automation.id))
        .map((automation) => (
          <Badge
            key={automation.id}
            variant="outline"
            className="max-w-56 gap-1 pr-1"
          >
            <span className="truncate">{automation.name}</span>
            <button
              type="button"
              aria-label={`Remove ${automation.name}`}
              onClick={() => toggle(automation.id, false)}
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
          {automations.map((automation) => (
            <DropdownMenuCheckboxItem
              key={automation.id}
              checked={value.includes(automation.id)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(next) => toggle(automation.id, next)}
            >
              <span className="truncate">{automation.name}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
