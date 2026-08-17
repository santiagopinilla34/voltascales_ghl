"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Tag,
  ToggleRight,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  createAutomation,
  saveAutomation,
  setAutomationActive,
} from "@/app/(app)/automations/actions";
import {
  TRIGGER_META,
  TRIGGER_OPTIONS,
} from "@/components/automations/trigger-meta";
import {
  type AiCondition,
  type EditorAction,
  type EditorState,
  type MatchMode,
  type TriggerType,
  blankEditorState,
  hasUnsupportedActions,
  templateVariablesFor,
  toAutomationInput,
  toEditorState,
} from "@/components/automations/editor-shape";
import { STATUS_OPTIONS } from "@/components/contacts/status-badge";
import { TagInput } from "@/components/contacts/tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Automation } from "@/types/database";
import { cn } from "@/lib/utils";

const MATCH_MODES: { value: MatchMode; label: string; hint: string }[] = [
  { value: "word", label: "Whole word", hint: '"stop" matches "Please stop." but not "stopwatch"' },
  { value: "exact", label: "Exact message", hint: "The entire text is the keyword" },
  { value: "contains", label: "Contains", hint: "Matches anywhere, including inside other words" },
];

const ACTION_META = {
  send_sms: { label: "Send SMS", Icon: MessageSquare },
  send_email: { label: "Send email", Icon: Mail },
  add_tag: { label: "Add tag", Icon: Tag },
  set_status: { label: "Set status", Icon: ToggleRight },
  notify_me: { label: "Email me", Icon: Mail },
} as const;

function newAction(type: EditorAction["type"]): EditorAction {
  switch (type) {
    case "send_sms":
      return { type: "send_sms", to: "contact", template: "" };
    case "send_email":
      return { type: "send_email", to: "contact", subject: "", template: "" };
    case "add_tag":
      return { type: "add_tag", tag: "" };
    case "set_status":
      return { type: "set_status", status: "active" };
    case "notify_me":
      return { type: "notify_me", note: "" };
  }
}

/**
 * Characters that quietly double the cost of a text.
 *
 * SMS is billed per segment, and a segment is 153 characters while every
 * character fits GSM-7. One that doesn't — an em dash, a curly apostrophe, an
 * accented letter, an emoji — switches the whole message to UCS-2 and cuts the
 * segment to 67. A single smart quote pasted in from a word processor can take
 * a two-segment confirmation to four, on every booking, forever.
 *
 * Not blocked, because sometimes the character is the right call. Warned
 * about, because the cost is otherwise completely invisible: nothing in the
 * message looks different and the bill arrives a month later.
 */
const GSM7 =
  /^[A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€\n\r]*$/;

function nonGsmCharacters(text: string): string[] {
  const offenders = new Set<string>();
  for (const character of text) {
    if (!GSM7.test(character)) offenders.add(character);
  }
  return [...offenders];
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Edits an existing rule, or drafts a new one when `automation` is null.
 *
 * A draft is held entirely in this component — nothing is inserted until it
 * validates, so an abandoned form leaves no row behind.
 */
export function AutomationEditor({
  automation,
}: {
  automation: Automation | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<EditorState>(() =>
    automation ? toEditorState(automation) : blankEditorState(),
  );

  // Changes what "the client" means in the recipient hint: for a booking it is
  // the details on the booking form, which need not be the contact's.
  const isBookingTrigger =
    state.triggerType === "booking_confirmed" ||
    state.triggerType === "booking_cancelled";
  const [error, setError] = useState<string | null>(null);
  // Optimistic mirror of `active`, so the switch moves under the cursor and
  // falls back to the server's answer once the transition settles.
  const [activeState, setActiveState] = useOptimistic(automation?.active ?? false);

  const droppedActions = hasUnsupportedActions(automation);

  function patch(changes: Partial<EditorState>) {
    setState((current) => ({ ...current, ...changes }));
  }

  function patchAction(index: number, changes: Partial<EditorAction>) {
    setState((current) => ({
      ...current,
      actions: current.actions.map((action, i) =>
        i === index ? ({ ...action, ...changes } as EditorAction) : action,
      ),
    }));
  }

  function moveAction(index: number, delta: number) {
    setState((current) => {
      const next = [...current.actions];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, actions: next };
    });
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const input = toAutomationInput(state);

      if (!automation) {
        const created = await createAutomation(input);

        if (!created.ok) {
          setError(created.error);
          return;
        }

        toast.success("Rule created", {
          description: "It starts paused — turn it on when you're happy with it.",
        });
        router.replace(`/automations/${created.value.id}`);
        return;
      }

      const result = await saveAutomation(automation.id, input);

      if (!result.ok) {
        // Inline and persistent: these come from the engine's own parsers and
        // usually name the exact field to fix.
        setError(result.error);
        return;
      }

      toast.success("Rule saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6 pb-4">
      {droppedActions && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            This rule contains an action type the editor can&apos;t show yet
            (<code>wait</code> or <code>notify_me</code>). It is listed below
            without it — <strong>saving will remove it</strong>. Edit the row in
            SQL instead if you need to keep it.
          </span>
        </p>
      )}

      <Section title="Name" description="What this rule is called in the list.">
        <Input
          value={state.name}
          onChange={(event) => patch({ name: event.target.value })}
          disabled={pending}
          aria-label="Rule name"
        />
      </Section>

      <Separator />

      <Section
        title="Trigger"
        description="What has to happen for this rule to be considered."
      >
        <Select
          value={state.triggerType}
          onValueChange={(value) => patch({ triggerType: value as TriggerType })}
          disabled={pending}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          {TRIGGER_META[state.triggerType].description}
        </p>

        {state.triggerType === "keyword" && (
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <div className="grid gap-2">
              <Label>Keywords</Label>
              <TagInput
                tags={state.keywords}
                onChange={(keywords) => patch({ keywords })}
                disabled={pending}
              />
              <p className="text-muted-foreground text-xs">
                Any one of these fires the rule. Matching ignores case.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Match</Label>
              <Select
                value={state.matchMode}
                onValueChange={(value) => patch({ matchMode: value as MatchMode })}
                disabled={pending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {MATCH_MODES.find((mode) => mode.value === state.matchMode)?.hint}
              </p>
            </div>

            <p className="text-muted-foreground rounded-md border-l-2 border-amber-400 pl-2 text-xs">
              Avoid carrier-reserved words — STOP, HELP, INFO, START, YES,
              CANCEL, END, QUIT, UNSTOP. Twilio answers those itself and never
              calls the webhook, so a rule keyed on one can never fire.
            </p>
          </div>
        )}

        {state.triggerType === "form_submit" && (
          <div className="grid gap-2 rounded-md border p-3">
            <Label>Form source (optional)</Label>
            <Input
              value={state.formSource}
              onChange={(event) => patch({ formSource: event.target.value })}
              placeholder="Any form"
              disabled={pending}
            />
            <p className="text-muted-foreground text-xs">
              Restricts the rule to one form, matched against the{" "}
              <code>source</code> field in the payload. Leave blank to fire for
              every form.
            </p>
          </div>
        )}
      </Section>

      <Separator />

      <Section
        title="Conditions"
        description="Checked against the contact after the trigger matches. Leave everything blank to run for everyone."
      >
        <div className="grid gap-2">
          <Label>Contact status is any of</Label>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((option) => {
              const checked = state.statuses.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    patch({
                      statuses: checked
                        ? state.statuses.filter((s) => s !== option.value)
                        : [...state.statuses, option.value],
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    checked
                      ? "bg-primary text-primary-foreground border-transparent"
                      : "hover:bg-accent",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {state.statuses.length === 0 && (
            <p className="text-muted-foreground text-xs">Any status.</p>
          )}
        </div>

        <div className="grid gap-2">
          <Label>AI handling</Label>
          <Select
            value={state.aiEnabled}
            onValueChange={(value) => patch({ aiEnabled: value as AiCondition })}
            disabled={pending}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Either</SelectItem>
              <SelectItem value="true">Only when AI is on</SelectItem>
              <SelectItem value="false">Only when AI is off</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>Contact has all of these tags</Label>
          <TagInput
            tags={state.hasTags}
            onChange={(hasTags) => patch({ hasTags })}
            disabled={pending}
          />
        </div>
      </Section>

      <Separator />

      <Section
        title="Actions"
        description="Run in order, top to bottom. If one fails the rest are abandoned and the run is logged as failed."
      >
        {state.actions.length === 0 && (
          <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
            No actions yet — a rule with none will not save.
          </p>
        )}

        <ol className="flex flex-col gap-2">
          {state.actions.map((action, index) => {
            const { label, Icon } = ACTION_META[action.type];

            return (
              <li key={index} className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {index + 1}
                  </span>
                  <Icon className="text-muted-foreground size-3.5" />
                  <span className="flex-1 text-xs font-medium">{label}</span>

                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={pending || index === 0}
                    onClick={() => moveAction(index, -1)}
                    aria-label={`Move ${label} up`}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={pending || index === state.actions.length - 1}
                    onClick={() => moveAction(index, 1)}
                    aria-label={`Move ${label} down`}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive size-7"
                    disabled={pending}
                    onClick={() =>
                      patch({
                        actions: state.actions.filter((_, i) => i !== index),
                      })
                    }
                    aria-label={`Remove ${label}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                {(action.type === "send_sms" || action.type === "send_email") && (
                  <div className="grid gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground text-xs">To</span>
                      {(["contact", "business"] as const).map((target) => (
                        <Button
                          key={target}
                          type="button"
                          size="xs"
                          variant={action.to === target ? "secondary" : "ghost"}
                          disabled={pending}
                          onClick={() => patchAction(index, { to: target })}
                        >
                          {target === "contact" ? "The client" : "You"}
                        </Button>
                      ))}
                      <span className="text-muted-foreground text-[11px]">
                        {action.to === "contact"
                          ? isBookingTrigger
                            ? "the phone and email on the booking"
                            : "the contact this rule fired for"
                          : action.type === "send_email"
                            ? "your business email, from My Business"
                            : "your alert number, from Settings"}
                      </span>
                    </div>

                    {action.type === "send_email" && (
                      <Input
                        value={action.subject}
                        onChange={(event) =>
                          patchAction(index, { subject: event.target.value })
                        }
                        placeholder="{{business_name}}: booked for {{booking_date}}"
                        disabled={pending}
                        aria-label="Email subject"
                      />
                    )}

                    <Textarea
                      value={action.template}
                      onChange={(event) =>
                        patchAction(index, { template: event.target.value })
                      }
                      rows={action.type === "send_email" ? 5 : 3}
                      disabled={pending}
                      placeholder="Hi {{first_name}}, thanks for getting in touch…"
                      aria-label="Message template"
                    />

                    {/* Only for SMS. An email has no segments and no per-message
                        cost, so the same character is free there. */}
                    {action.type === "send_sms" &&
                      (() => {
                        const offenders = nonGsmCharacters(action.template);
                        if (offenders.length === 0) return null;
                        return (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            {offenders.map((character) => (
                              <code key={character} className="mr-1">
                                {character}
                              </code>
                            ))}
                            {offenders.length === 1 ? "is" : "are"} outside the
                            basic SMS alphabet, which cuts each segment from 153
                            characters to 67 — roughly doubling what this text
                            costs to send. Fine if you meant it.
                          </p>
                        );
                      })()}

                    <p className="text-muted-foreground text-xs">
                      Variables:{" "}
                      {templateVariablesFor(state.triggerType).map((variable) => (
                        <code key={variable} className="mr-1">
                          {`{{${variable}}}`}
                        </code>
                      ))}
                    </p>
                  </div>
                )}

                {action.type === "add_tag" && (
                  <Input
                    value={action.tag}
                    onChange={(event) =>
                      patchAction(index, { tag: event.target.value })
                    }
                    placeholder="pricing-request"
                    disabled={pending}
                    aria-label="Tag to add"
                  />
                )}

                {action.type === "notify_me" && (
                  <div className="grid gap-1.5">
                    <Textarea
                      value={action.note}
                      onChange={(event) =>
                        patchAction(index, { note: event.target.value })
                      }
                      rows={2}
                      disabled={pending}
                      placeholder="Optional note to include — e.g. {{name}} asked about pricing"
                      aria-label="Note to include in the email"
                    />
                    <p className="text-muted-foreground text-xs">
                      Goes to the notification email in Settings. The contact and
                      a link to the thread are always included.
                    </p>
                  </div>
                )}

                {action.type === "set_status" && (
                  <Select
                    value={action.status}
                    onValueChange={(value) => patchAction(index, { status: value })}
                    disabled={pending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(ACTION_META) as EditorAction["type"][]).map((type) => (
            <Button
              key={type}
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                patch({ actions: [...state.actions, newAction(type)] })
              }
            >
              <Plus className="size-3.5" />
              {ACTION_META[type].label}
            </Button>
          ))}
        </div>
      </Section>

      {error && (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <div className="bg-background sticky bottom-0 flex items-center gap-2 border-t py-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {automation ? "Save rule" : "Create rule"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setState(automation ? toEditorState(automation) : blankEditorState());
            setError(null);
          }}
        >
          {automation ? "Reset" : "Clear"}
        </Button>

        {automation ? (
          // Live toggle rather than the read-only indicator this used to be:
          // after saving an edit, turning the rule on is the very next thing
          // you want, and bouncing back to the list to do it is friction.
          <label className="text-muted-foreground ml-auto flex cursor-pointer items-center gap-2 text-xs">
            {activeState ? "Active" : "Paused"}
            <Switch
              checked={activeState}
              disabled={pending}
              aria-label="Rule is active"
              onCheckedChange={(next) => {
                startTransition(async () => {
                  setActiveState(next);
                  const result = await setAutomationActive(automation.id, next);

                  if (!result.ok) {
                    toast.error("Could not change the rule", {
                      description: result.error,
                    });
                    return;
                  }

                  toast.success(next ? "Rule is live" : "Rule is paused");
                  router.refresh();
                });
              }}
            />
          </label>
        ) : (
          <span className="text-muted-foreground ml-auto text-xs">
            Created paused
          </span>
        )}
      </div>
    </form>
  );
}
