"use client";

import { X } from "lucide-react";

import { ACTION_META } from "@/components/automations/action-meta";
import type { Selection } from "@/components/automations/canvas/workflow-canvas";
import {
  templateVariablesFor,
  type AiCondition,
  type EditorAction,
  type EditorState,
  type EditorTrigger,
  type MatchMode,
} from "@/components/automations/editor-shape";
import { TRIGGER_META, type TriggerKey } from "@/components/automations/trigger-meta";
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
import { Textarea } from "@/components/ui/textarea";
import { nonGsmCharacters } from "@/components/automations/gsm";

/**
 * The right-hand panel: everything about whichever node is selected.
 *
 * Replaces the stacked form the editor used to be. The reason is not that a
 * canvas is prettier — it is that a rule with two triggers and five steps was
 * a page of fields where nothing said which field belonged to which step. One
 * node at a time is the whole point.
 */

/**
 * Resend's email events, in the order they matter.
 *
 * Bounced and complained first: they are the ones whose absence is invisible —
 * a hard bounce looks exactly like a delivery from inside this app — and the
 * ones anybody wants a rule on. Delivered and opened are last because a rule
 * that fires on every delivery mostly produces noise.
 *
 * Kept in step with EMAIL_EVENTS in `lib/automations/config.ts`, which is the
 * server-only half that validates them. Duplicated rather than imported for
 * the usual reason — that module is server-only and this renders in a browser.
 */
const EMAIL_EVENT_CHOICES: { value: string; label: string; hint: string }[] = [
  {
    value: "bounced",
    label: "Bounced",
    hint: "The receiving server permanently rejected it.",
  },
  {
    value: "complained",
    label: "Marked as spam",
    hint: "The recipient reported it. Worth knowing about immediately.",
  },
  {
    value: "delivery_delayed",
    label: "Delayed",
    hint: "Not delivered yet, still trying.",
  },
  { value: "failed", label: "Failed", hint: "Resend could not send it at all." },
  {
    value: "suppressed",
    label: "Suppressed",
    hint: "Not sent, because the address is on your suppression list.",
  },
  {
    value: "opened",
    label: "Opened",
    hint: "Needs open tracking switched on for the domain in Resend.",
  },
  {
    value: "clicked",
    label: "Link clicked",
    hint: "Needs click tracking switched on for the domain in Resend.",
  },
  {
    value: "delivered",
    label: "Delivered",
    hint: "Fires for every email that lands — usually a lot.",
  },
];

const MATCH_MODES: { value: MatchMode; label: string; hint: string }[] = [
  {
    value: "word",
    label: "Whole word",
    hint: '"stop" matches "Please stop." but not "stopwatch"',
  },
  { value: "exact", label: "Exact message", hint: "The entire text is the keyword" },
  {
    value: "contains",
    label: "Contains",
    hint: "Matches anywhere, including inside other words",
  },
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
    </div>
  );
}

function Variables({ names }: { names: string[] }) {
  return (
    <p className="text-muted-foreground text-[11px]">
      Variables:{" "}
      {names.map((name) => (
        <code key={name} className="mr-1">{`{{${name}}}`}</code>
      ))}
    </p>
  );
}

function TriggerConfig({
  trigger,
  disabled,
  onChange,
}: {
  trigger: EditorTrigger;
  disabled: boolean;
  onChange: (fields: Partial<EditorTrigger>) => void;
}) {
  const meta = TRIGGER_META[trigger.type as TriggerKey];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">{meta?.description}</p>

      {trigger.type === "keyword" && (
        <>
          <Field label="Keywords">
            <TagInput
              tags={trigger.keywords}
              onChange={(keywords) => onChange({ keywords })}
              disabled={disabled}
            />
          </Field>

          <Field
            label="How to match"
            hint={MATCH_MODES.find((mode) => mode.value === trigger.matchMode)?.hint}
          >
            <Select
              value={trigger.matchMode}
              onValueChange={(value) => onChange({ matchMode: value as MatchMode })}
              disabled={disabled}
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
          </Field>
        </>
      )}

      {trigger.type === "form_submit" && (
        <Field
          label="Only this form (optional)"
          hint="Left empty, the rule fires for every form."
        >
          <Input
            value={trigger.formSource}
            onChange={(event) => onChange({ formSource: event.target.value })}
            placeholder="contact-page"
            disabled={disabled}
          />
        </Field>
      )}

      {trigger.type === "email_event" && (
        <>
          <Field
            label="Which events"
            hint={
              trigger.emailEvents.length === 0
                ? "Pick at least one — a rule listening for nothing can't be saved."
                : undefined
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {EMAIL_EVENT_CHOICES.map((choice) => {
                const on = trigger.emailEvents.includes(choice.value);
                return (
                  <Button
                    key={choice.value}
                    type="button"
                    size="xs"
                    variant={on ? "secondary" : "outline"}
                    disabled={disabled}
                    title={choice.hint}
                    onClick={() =>
                      onChange({
                        emailEvents: on
                          ? trigger.emailEvents.filter(
                              (value) => value !== choice.value,
                            )
                          : [...trigger.emailEvents, choice.value],
                      })
                    }
                  >
                    {choice.label}
                  </Button>
                );
              })}
            </div>
          </Field>

          {/* Said here rather than left to be discovered in the run log. The
              guard is in the engine either way, but somebody building a
              bounce rule will reach for "email them about it" first. */}
          {trigger.emailEvents.some((event) =>
            ["bounced", "complained", "suppressed"].includes(event),
          ) && (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-[11px]">
              An email step addressed to the client is skipped for these
              events — the address just bounced or reported spam, so writing to
              it again would bounce again and fire this rule in a loop. Texting
              them, tagging them, or emailing you all still run.
            </p>
          )}
        </>
      )}

      {trigger.type !== "keyword" &&
        trigger.type !== "form_submit" &&
        trigger.type !== "email_event" && (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-[11px]">
          This trigger has nothing to configure — it either happened or it
          didn&apos;t. Narrow it with the filters on the rule instead.
        </p>
      )}
    </div>
  );
}

function ActionConfig({
  action,
  triggerTypes,
  isBooking,
  disabled,
  onChange,
}: {
  action: EditorAction;
  triggerTypes: EditorTrigger["type"][];
  isBooking: boolean;
  disabled: boolean;
  onChange: (fields: Partial<EditorAction>) => void;
}) {
  // The union of every trigger's variables. A rule that fires on two things
  // can use either set — the ones that don't apply on a given run render empty
  // and are reported in the run log, which is better than hiding them here and
  // leaving somebody to guess.
  const variables = [
    ...new Set(triggerTypes.flatMap((type) => templateVariablesFor(type))),
  ];

  return (
    <div className="flex flex-col gap-4">
      {(action.type === "send_sms" || action.type === "send_email") && (
        <>
          <Field
            label="Send to"
            hint={
              action.to === "contact"
                ? isBooking
                  ? "The phone and email given on the booking form."
                  : "The contact this rule fired for."
                : action.type === "send_email"
                  ? "Your business email, from My Business."
                  : "Your alert number, from Settings."
            }
          >
            <div className="flex gap-1.5">
              {(["contact", "business"] as const).map((target) => (
                <Button
                  key={target}
                  type="button"
                  size="sm"
                  variant={action.to === target ? "secondary" : "outline"}
                  disabled={disabled}
                  onClick={() => onChange({ to: target })}
                >
                  {target === "contact" ? "The client" : "You"}
                </Button>
              ))}
            </div>
          </Field>

          {action.type === "send_email" && (
            <Field label="Subject">
              <Input
                value={action.subject}
                onChange={(event) => onChange({ subject: event.target.value })}
                placeholder="{{business_name}}: booked for {{booking_date}}"
                disabled={disabled}
              />
            </Field>
          )}

          <Field label="Message">
            <Textarea
              value={action.template}
              onChange={(event) => onChange({ template: event.target.value })}
              rows={action.type === "send_email" ? 8 : 5}
              placeholder="Hi {{first_name}}…"
              disabled={disabled}
            />
          </Field>

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
                  {offenders.length === 1 ? "is" : "are"} outside the basic SMS
                  alphabet, which cuts each segment from 153 characters to 67 —
                  roughly doubling what this text costs. Fine if you meant it.
                </p>
              );
            })()}

          <Variables names={variables} />
        </>
      )}

      {action.type === "add_tag" && (
        <Field label="Tag" hint="Added to the contact, if there is one.">
          <Input
            value={action.tag}
            onChange={(event) => onChange({ tag: event.target.value })}
            placeholder="pricing-request"
            disabled={disabled}
          />
        </Field>
      )}

      {action.type === "set_status" && (
        <Field label="Status">
          <Select
            value={action.status}
            onValueChange={(value) => onChange({ status: value })}
            disabled={disabled}
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
        </Field>
      )}

      {action.type === "notify_me" && (
        <>
          <Field
            label="Note (optional)"
            hint="The alert always says which contact tripped which rule."
          >
            <Textarea
              value={action.note}
              onChange={(event) => onChange({ note: event.target.value })}
              rows={3}
              placeholder="{{name}} asked about pricing"
              disabled={disabled}
            />
          </Field>
          <Variables names={variables} />
        </>
      )}
    </div>
  );
}

function ConditionsConfig({
  state,
  disabled,
  onChange,
}: {
  state: EditorState;
  disabled: boolean;
  onChange: (fields: Partial<EditorState>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        Checked after a trigger fires. A rule with no filters runs for everyone.
      </p>

      <Field label="Contact status" hint="Left empty, any status matches.">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((option) => {
            const on = state.statuses.includes(option.value);
            return (
              <Button
                key={option.value}
                type="button"
                size="xs"
                variant={on ? "secondary" : "outline"}
                disabled={disabled}
                onClick={() =>
                  onChange({
                    statuses: on
                      ? state.statuses.filter((value) => value !== option.value)
                      : [...state.statuses, option.value],
                  })
                }
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </Field>

      <Field label="AI handling">
        <Select
          value={state.aiEnabled}
          onValueChange={(value) => onChange({ aiEnabled: value as AiCondition })}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Either</SelectItem>
            <SelectItem value="true">On</SelectItem>
            <SelectItem value="false">Off</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Has all of these tags">
        <TagInput
          tags={state.hasTags}
          onChange={(hasTags) => onChange({ hasTags })}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}

export function NodeConfigPanel({
  state,
  selection,
  disabled,
  onClose,
  onPatchState,
  onPatchTrigger,
  onPatchAction,
}: {
  state: EditorState;
  selection: Exclude<Selection, null>;
  disabled: boolean;
  onClose: () => void;
  onPatchState: (fields: Partial<EditorState>) => void;
  onPatchTrigger: (index: number, fields: Partial<EditorTrigger>) => void;
  onPatchAction: (index: number, fields: Partial<EditorAction>) => void;
}) {
  const title =
    selection.kind === "conditions"
      ? "Filters"
      : selection.kind === "trigger"
        ? (TRIGGER_META[state.triggers[selection.index]?.type as TriggerKey]?.label ??
          "Trigger")
        : (ACTION_META[state.actions[selection.index]?.type]?.label ?? "Step");

  const isBooking = state.triggers.some(
    (trigger) =>
      trigger.type === "booking_confirmed" || trigger.type === "booking_cancelled",
  );

  return (
    <aside className="bg-card flex w-full min-w-0 flex-col border-l lg:w-[340px] lg:shrink-0">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selection.kind === "conditions" && (
          <ConditionsConfig
            state={state}
            disabled={disabled}
            onChange={onPatchState}
          />
        )}

        {selection.kind === "trigger" && state.triggers[selection.index] && (
          <TriggerConfig
            trigger={state.triggers[selection.index]}
            disabled={disabled}
            onChange={(fields) => onPatchTrigger(selection.index, fields)}
          />
        )}

        {selection.kind === "action" && state.actions[selection.index] && (
          <ActionConfig
            action={state.actions[selection.index]}
            triggerTypes={state.triggers.map((trigger) => trigger.type)}
            isBooking={isBooking}
            disabled={disabled}
            onChange={(fields) => onPatchAction(selection.index, fields)}
          />
        )}
      </div>
    </aside>
  );
}
