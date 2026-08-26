"use client";

import { useState } from "react";
import { Info, Plus, Trash2, UserRoundPen } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTACT_DESCRIBE_MAX,
  CONTACT_FIELDS,
  AUTOMATION_NAME_MAX,
  contactFieldIsBlank,
  contactFieldLabel,
  contactFieldProblem,
  newContactFieldUpdate,
  type ContactFieldKey,
  type ContactFieldUpdate,
} from "@/lib/ai-agents/bots";
import { cn } from "@/lib/utils";

/**
 * Setting up the contact-details action.
 *
 * One field per entry, and a sentence saying what fills it. The rail is the
 * same shape as the automation dialog's, because it is the same job — several
 * small rules, edited one at a time — and two layouts for one idea is how a
 * screen stops being learnable.
 *
 * Front end only. The fields on offer are the account's real contact columns,
 * so nothing here promises to write somewhere that does not exist.
 */
export function ContactFieldsDialog({
  open,
  onOpenChange,
  updates,
  onSave,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The entries as saved. The dialog edits a copy. */
  updates: ContactFieldUpdate[];
  onSave: (updates: ContactFieldUpdate[]) => void;
  /** Take the contact-details action off this bot entirely. */
  onRemove: () => void;
}) {
  return (
    // Keyed on `open` so each opening starts from what was saved rather than
    // from whatever was abandoned last time — Cancel is supposed to mean it.
    <Dialog key={String(open)} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
              <UserRoundPen className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle>Collect contact details</DialogTitle>
              <DialogDescription className="text-xs">
                Fill in a field on the contact from what they tell you. Only
                empty fields are written.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ContactFieldsForm
          updates={updates}
          onSave={onSave}
          onRemove={onRemove}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ContactFieldsForm({
  updates,
  onSave,
  onRemove,
  onCancel,
}: {
  updates: ContactFieldUpdate[];
  onSave: (updates: ContactFieldUpdate[]) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  // Opening on an action with nothing on it starts you on a blank entry
  // rather than on an empty pane and a button.
  const [draft, setDraft] = useState<ContactFieldUpdate[]>(() =>
    updates.length > 0 ? updates : [newContactFieldUpdate()],
  );
  const [activeId, setActiveId] = useState(() => draft[0].id);

  const active = draft.find((update) => update.id === activeId) ?? draft[0];

  function patch(changes: Partial<ContactFieldUpdate>) {
    setDraft((current) =>
      current.map((update) =>
        update.id === active.id ? { ...update, ...changes } : update,
      ),
    );
  }

  function add() {
    const created = newContactFieldUpdate();
    setDraft((current) => [...current, created]);
    setActiveId(created.id);
  }

  function remove() {
    // The last entry going is the action going: a contact-details action with
    // no field writes nothing, and leaving it on the bot to say so is worse
    // than taking it off.
    if (draft.length === 1) {
      onRemove();
      return;
    }

    const index = draft.findIndex((update) => update.id === active.id);
    const rest = draft.filter((update) => update.id !== active.id);

    setDraft(rest);
    setActiveId(rest[Math.min(index, rest.length - 1)].id);
  }

  // Fields already spoken for by another entry. One entry per field, so these
  // go dead in the menu rather than disappearing — a list that shrinks as you
  // work does not explain why.
  const taken = new Set(
    draft
      .filter((update) => update.id !== active.id && update.field)
      .map((update) => update.field as ContactFieldKey),
  );

  const problem = contactFieldProblem(draft);
  const untouched = draft.length === 1 && contactFieldIsBlank(draft[0]);
  const full = taken.size + 1 >= CONTACT_FIELDS.length;

  const chosen = CONTACT_FIELDS.find((field) => field.value === active.field);

  return (
    <div className="flex flex-col gap-4">
      {/* The one thing people get wrong about this action: adding it does not
          make the bot ask. It listens; the prompt has to do the asking. */}
      <div className="bg-muted/50 text-muted-foreground flex gap-2 rounded-lg border p-3 text-xs leading-relaxed">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p>
          <span className="text-foreground font-medium">
            This listens, it does not ask.
          </span>{" "}
          The bot fills a field only when the contact volunteers the answer, so
          put the question in your prompt too — &quot;ask what company they
          work for&quot;.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
        <ol className="flex max-h-[45vh] flex-col gap-0.5 overflow-y-auto sm:border-r sm:pr-2">
          {draft.map((update) => (
            <li key={update.id}>
              <button
                type="button"
                onClick={() => setActiveId(update.id)}
                className={cn(
                  "hover:bg-muted/50 w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  update.id === active.id
                    ? "bg-muted font-medium"
                    : "text-muted-foreground",
                )}
              >
                {contactFieldLabel(update)}
              </button>
            </li>
          ))}
        </ol>

        <div className="flex max-h-[45vh] flex-col gap-4 overflow-x-hidden overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-field" className="text-xs">
              Which field to fill <span className="text-destructive">*</span>
            </Label>

            {/* Empty string rather than `undefined` for "nothing picked".
                `undefined` makes Radix treat the select as uncontrolled, and
                it then keeps showing the previous entry's field. */}
            <Select
              value={active.field ?? ""}
              onValueChange={(field) =>
                patch({ field: field as ContactFieldKey })
              }
            >
              <SelectTrigger id="contact-field" className="w-full">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_FIELDS.map((field) => (
                  <SelectItem
                    key={field.value}
                    value={field.value}
                    disabled={taken.has(field.value)}
                  >
                    {field.label}
                    {taken.has(field.value) && " — already set"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Why the obvious three are missing. Asked often enough that it
              belongs on the screen rather than in a docs page. */}
          <div className="bg-muted/50 text-muted-foreground flex gap-2 rounded-lg border p-3 text-xs leading-relaxed">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <p>
              Name, email and phone are not on this list. The thread already
              keeps those up to date, so ask for them in your prompt and skip
              this action.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-describe" className="text-xs">
              What fills it <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="contact-describe"
              value={active.describe}
              maxLength={CONTACT_DESCRIBE_MAX}
              rows={3}
              placeholder={chosen?.placeholder ?? "The company they work for"}
              onChange={(event) => patch({ describe: event.target.value })}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Describe the answer you are after, not the question you ask. This
              is what the bot matches against what it hears.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-name" className="text-xs">
              Name this entry{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="contact-name"
              value={active.name}
              maxLength={AUTOMATION_NAME_MAX}
              placeholder={contactFieldLabel({ ...active, name: "" })}
              onChange={(event) => patch({ name: event.target.value })}
            />
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
          // Every field spoken for. Dead rather than gone, so the limit reads
          // as a rule about the contact rather than as a missing button.
          disabled={full}
          className="sm:mr-auto"
        >
          <Plus />
          {full ? "Every field is set" : "Add new field"}
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
