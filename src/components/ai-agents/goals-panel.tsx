"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Clock, Info, Minus, Plus, X } from "lucide-react";

import { AutomationDialog } from "@/components/ai-agents/automation-dialog";
import { BookingDialog } from "@/components/ai-agents/booking-dialog";
import { ContactFieldsDialog } from "@/components/ai-agents/contact-fields-dialog";
import { TestPanel } from "@/components/ai-agents/training-panel";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AI_MODEL_OPTIONS, aiModelLabel } from "@/lib/ai/models";
import {
  BOT_ACTIONS,
  PROMPT_FIELDS,
  INACTIVITY_MINUTES_MAX,
  MIN_MESSAGES_MAX,
  MIN_MESSAGES_MIN,
  PROMPT_WORDS_MAX,
  SUMMARY_RECIPIENTS,
  summaryProblem,
  wordCount,
  type AutomationOption,
  type AutomationTrigger,
  type BookingSettings,
  type BotActionKind,
  type ContactFieldUpdate,
  type BotGoals,
  type ConversationBot,
  type SummaryRecipient,
  type SummarySettings,
} from "@/lib/ai-agents/bots";
import { MODEL_PRICES, formatUsdCents } from "@/lib/usage/pricing";
import { cn } from "@/lib/utils";
import type { AiModel } from "@/types/database";

/**
 * The Goals tab: who the bot is, what it is for, and what it may do.
 *
 * Two columns, matching Training, and for the same reason — you change a line
 * of the prompt and ask the bot a question, over and over. The test panel is
 * literally the one from Training rather than a copy: it is the same panel
 * doing the same job, and two of them would drift.
 *
 * The prompt is three boxes rather than one. One box is what people are given
 * elsewhere, and what they fill with an unstructured wall that a model reads
 * unevenly; asking who the bot is, what it is for, and what else it needs to
 * know gets most of a good prompt out of someone who has never written one.
 *
 * Everything writes to the draft above. Nothing reaches Postgres until the
 * editor's Save.
 */
export function GoalsPanel({
  bot,
  goals,
  onChange,
  automations,
}: {
  /** The draft as it stands, for the test panel beside it. */
  bot: ConversationBot;
  goals: BotGoals;
  onChange: (goals: BotGoals) => void;
  /** The account's real automations, for the two action dialogs that pick one. */
  automations: AutomationOption[];
}) {
  function patch(changes: Partial<BotGoals>) {
    onChange({ ...goals, ...changes });
  }

  const words =
    wordCount(goals.personality) +
    wordCount(goals.goal) +
    wordCount(goals.additional);

  const left = PROMPT_WORDS_MAX - words;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex flex-col gap-4 rounded-xl border p-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Bot goals</h3>
          <p className="text-muted-foreground text-xs leading-relaxed">
            The bot&apos;s personality, what it is trying to achieve, and what
            it is allowed to do besides talk.
          </p>
        </div>

        <ModelRow goals={goals} onChange={patch} words={words} />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium">Prompt</p>
            <p
              className={cn(
                "text-muted-foreground text-xs tabular-nums",
                // Only coloured once it means something. A counter that is red
                // from the first keystroke is a counter people stop reading.
                left < 0 && "text-destructive",
              )}
            >
              {left < 0
                ? `${Math.abs(left)} words over`
                : `${left} words left`}
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border p-3">
            <PromptField
              id="goals-personality"
              label="Personality"
              tooltip="Who the bot is. Is it you or an assistant? Formal or blunt? This is the voice every reply is written in."
              value={goals.personality}
              onChange={(personality) => patch({ personality })}
              rows={4}
            />

            <PromptField
              id="goals-goal"
              label="Goal"
              tooltip="What the bot is trying to get out of the conversation — an answered question, a booked call, a qualified lead."
              value={goals.goal}
              onChange={(goal) => patch({ goal })}
              rows={3}
            />

            <PromptField
              id="goals-additional"
              label="Additional information"
              tooltip="Everything else it needs: how to speak, what it must never say, rules about your business, worked examples."
              value={goals.additional}
              onChange={(additional) => patch({ additional })}
              rows={8}
            />
          </div>

          <p className="text-muted-foreground text-xs leading-relaxed">
            Be specific about what the bot must never do. Most bad replies come
            from a prompt that never said not to.
          </p>
        </div>

        <ActionPicker
          value={goals.actions}
          onChange={(actions) => patch({ actions })}
          booking={goals.booking}
          // One patch rather than two setters. `patch` builds from the `goals`
          // it was rendered with, so two calls in a row would both start
          // from the old one and the second would undo the first.
          onSaveBooking={(booking, actions) => patch({ booking, actions })}
          triggers={goals.automations}
          onSaveTriggers={(triggers, actions) =>
            patch({ automations: triggers, actions })
          }
          contactFields={goals.contact_fields}
          onSaveContactFields={(contactFields, actions) =>
            patch({ contact_fields: contactFields, actions })
          }
          automations={automations}
        />

        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-xs font-medium">Preferences</p>

          <Label className="flex max-w-2xl items-start justify-between gap-4 font-normal">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium">
                Write a conversation summary
              </span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                Saves a few lines onto the contact when the thread goes quiet,
                so the next person reading it does not start from scratch.
              </span>
            </span>

            <Switch
              checked={goals.conversation_summary}
              onCheckedChange={(conversation_summary) =>
                patch({ conversation_summary })
              }
            />
          </Label>

          {/* Revealed by the switch, like the response style on the settings
              tab. Six controls greyed out is a wall; the same six appearing
              when you ask for them is a section. */}
          {goals.conversation_summary && (
            <SummaryFields
              summary={goals.summary}
              onChange={(summary) => patch({ summary })}
            />
          )}
        </div>
      </section>

      <TestPanel bot={bot} />
    </div>
  );
}

/**
 * When a summary gets written, and who hears about it.
 *
 * Two numbers and then a short list of consequences, in that order, because
 * the numbers decide whether a summary happens at all and the rest only
 * matters once one does.
 */
function SummaryFields({
  summary,
  onChange,
}: {
  summary: SummarySettings;
  onChange: (summary: SummarySettings) => void;
}) {
  // Hours when the value is a round number of them, so "2 hours" does not read
  // back as "120 minutes" the next time the screen is opened.
  const [unit, setUnit] = useState<"minutes" | "hours">(() =>
    summary.inactivity_minutes > 0 && summary.inactivity_minutes % 60 === 0
      ? "hours"
      : "minutes",
  );

  function patch(changes: Partial<SummarySettings>) {
    onChange({ ...summary, ...changes });
  }

  function toggleRecipient(value: SummaryRecipient, on: boolean) {
    patch({
      recipients: on
        ? [...summary.recipients, value]
        : summary.recipients.filter((item) => item !== value),
    });
  }

  const problem = summaryProblem(true, summary);

  return (
    <div className="flex max-w-2xl flex-col gap-4 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">Quiet for</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            How long with nothing from either side before the thread counts as
            over.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Input
            type="number"
            min={1}
            aria-label="Inactivity before a summary is written"
            value={
              unit === "hours"
                ? summary.inactivity_minutes / 60
                : summary.inactivity_minutes
            }
            onChange={(event) => {
              const typed = Number(event.target.value);
              if (Number.isNaN(typed)) return;

              const minutes = unit === "hours" ? typed * 60 : typed;

              patch({
                inactivity_minutes: Math.min(
                  Math.max(minutes, 1),
                  INACTIVITY_MINUTES_MAX,
                ),
              });
            }}
            className="w-24"
          />

          <Select
            value={unit}
            onValueChange={(next) => setUnit(next as "minutes" | "hours")}
          >
            <SelectTrigger className="w-28" aria-label="Unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutes</SelectItem>
              <SelectItem value="hours">Hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-t pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">At least this many messages</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Below this, nothing is written. A two-message thread summarises to
            less than the thread.
          </p>
        </div>

        <Stepper
          value={summary.min_messages}
          min={MIN_MESSAGES_MIN}
          max={MIN_MESSAGES_MAX}
          label="messages"
          onChange={(min_messages) => patch({ min_messages })}
        />
      </div>

      <div className="flex flex-col gap-2 border-t pt-3">
        <Label className="flex items-center gap-2 text-xs font-normal">
          <Checkbox
            checked={summary.trigger_workflow}
            onCheckedChange={(checked) =>
              patch({ trigger_workflow: checked === true })
            }
          />
          Start an automation when the summary is written
        </Label>

        <Label className="flex items-center gap-2 text-xs font-normal">
          <Checkbox
            checked={summary.email_notify}
            onCheckedChange={(checked) =>
              patch({ email_notify: checked === true })
            }
          />
          Email the summary to someone
        </Label>
      </div>

      {summary.email_notify && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-xs font-medium">Send it to</p>

          {SUMMARY_RECIPIENTS.map((recipient) => (
            <Label
              key={recipient.value}
              className="flex items-start gap-2 text-xs font-normal"
            >
              <Checkbox
                checked={summary.recipients.includes(recipient.value)}
                onCheckedChange={(checked) =>
                  toggleRecipient(recipient.value, checked === true)
                }
                className="mt-0.5"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{recipient.label}</span>
                <span className="text-muted-foreground leading-relaxed">
                  {recipient.hint}
                </span>
              </span>
            </Label>
          ))}

          {summary.recipients.includes("custom") && (
            <Input
              value={summary.custom_emails}
              onChange={(event) =>
                patch({ custom_emails: event.target.value })
              }
              placeholder="someone@example.com, someone-else@example.com"
              aria-label="Email addresses to send summaries to"
              className="mt-1"
            />
          )}

          {/* The same sentence the Save button is blocked by, from the same
              function — a second wording here is how the error on screen and
              the reason you cannot save end up disagreeing. */}
          {problem && <p className="text-destructive text-xs">{problem}</p>}
        </div>
      )}
    </div>
  );
}

/** A number you nudge. Same control the settings tab uses for its message cap. */
function Stepper({
  value,
  min,
  max,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.min(Math.max(next, min), max);

  return (
    <div className="flex w-36 shrink-0 items-center gap-1 rounded-lg border p-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Fewer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus />
      </Button>

      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        aria-label={`Minimum ${label}`}
        onChange={(event) => {
          const typed = Number(event.target.value);
          if (!Number.isNaN(typed)) onChange(clamp(typed));
        }}
        className="h-6 border-0 bg-transparent text-center tabular-nums shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`More ${label}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Plus />
      </Button>
    </div>
  );
}

/**
 * The model, its fallback, and what a reply is likely to cost.
 *
 * The estimate is on this row rather than hidden behind the model name because
 * the model is the only thing on this screen that costs money, and the gap
 * between the cheapest and the dearest is a factor of five. Someone choosing
 * between them should not have to go to another page to find that out.
 */
function ModelRow({
  goals,
  onChange,
  words,
}: {
  goals: BotGoals;
  onChange: (changes: Partial<BotGoals>) => void;
  words: number;
}) {
  // Four characters a token is the usual rule of thumb for English, and words
  // are what this screen already counts. It is an estimate, and labelled as
  // one — the alternative is shipping a tokenizer to the browser to put a
  // slightly better number next to the word "approx".
  const promptTokens = Math.round(words * 1.33);

  const estimate = useMemo(() => {
    const price = MODEL_PRICES[goals.model];
    if (!price) return null;

    // A reply is the prompt plus some conversation, in and a short answer out.
    // Both stated here rather than tuned, so the number can be read back from
    // the numbers rather than trusted.
    const inputTokens = promptTokens + 400;
    const outputTokens = 150;

    const dollars =
      (inputTokens / 1_000_000) * price.input +
      (outputTokens / 1_000_000) * price.output;

    return { inputTokens, outputTokens, cents: dollars * 100 };
  }, [goals.model, promptTokens]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={goals.model}
          onValueChange={(model) => onChange({ model: model as AiModel })}
        >
          <SelectTrigger className="w-56" aria-label="Model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_MODEL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* The fallback is a second control rather than a second row: it is
            the same decision made twice, and it is empty on most bots. */}
        <Select
          value={goals.fallback_model ?? "none"}
          onValueChange={(value) =>
            onChange({
              fallback_model: value === "none" ? null : (value as AiModel),
            })
          }
        >
          <SelectTrigger className="w-56" aria-label="Fallback model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No fallback</SelectItem>
            {AI_MODEL_OPTIONS.filter(
              (option) => option.value !== goals.model,
            ).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                Fall back to {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <span className="tabular-nums">~{promptTokens} prompt tokens</span>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="How this is estimated"
              className="hover:text-foreground"
            >
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>

          <TooltipContent className="max-w-72">
            {estimate ? (
              <div className="flex flex-col gap-1.5 text-xs">
                <p className="font-medium">
                  About {formatUsdCents(estimate.cents)} per reply
                </p>
                <p className="leading-relaxed">
                  Assuming {estimate.inputTokens} tokens in — your prompt plus
                  some conversation — and {estimate.outputTokens} out, at{" "}
                  {aiModelLabel(goals.model)} list prices.
                </p>
                <p className="leading-relaxed">
                  An estimate. Knowledge bases, actions and images all add
                  tokens when they are used.
                </p>
              </div>
            ) : (
              <p className="text-xs">
                No price on file for this model, so no estimate rather than a
                guess.
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * One box of the prompt, with its explanation and a field inserter.
 *
 * The insert menu writes at the caret rather than appending, because a field
 * belongs in the middle of a sentence — "You are the front desk for
 * {{business_name}}" — and a menu that only appends teaches people to type the
 * braces by hand instead.
 */
function PromptField({
  id,
  label,
  tooltip,
  value,
  onChange,
  rows,
}: {
  id: string;
  label: string;
  tooltip: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Where the caret was when the box last had it.
  //
  // Read from a ref rather than from the textarea at insert time, because by
  // then focus is inside the open menu. Live `selectionStart` on a box that has
  // never been focused is 0, not null, so the obvious fallback never fires and
  // every field lands in front of the first word.
  const caret = useRef<{ start: number; end: number } | null>(null);

  function remember(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const box = event.currentTarget;
    caret.current = { start: box.selectionStart, end: box.selectionEnd };
  }

  function insert(name: string) {
    const field = `{{${name}}}`;

    // Never focused: append. Guessing a position inside text somebody has not
    // put a caret in is how a field ends up splitting a sentence.
    const { start, end } = caret.current ?? {
      start: value.length,
      end: value.length,
    };

    onChange(value.slice(0, start) + field + value.slice(end));

    const at = start + field.length;
    caret.current = { start: at, end: at };

    // Next frame: the new value has not reached the DOM yet inside this
    // handler, so setting the range now would clamp it to the old length.
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(at, at);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className="flex items-center gap-1.5 text-xs">
          {label}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`What ${label.toLowerCase()} is for`}
                className="text-muted-foreground hover:text-foreground"
              >
                <Info className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">
              <p className="text-xs leading-relaxed">{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </Label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs">
              Insert field
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            {PROMPT_FIELDS.map((group, index) => (
              <div key={group.group}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel>{group.group}</DropdownMenuLabel>

                {group.fields.map((field) => (
                  <DropdownMenuItem
                    key={field.name}
                    onClick={() => insert(field.name)}
                    className="flex-col items-start gap-0"
                  >
                    <span className="font-mono text-xs">
                      {`{{${field.name}}}`}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {field.hint}
                    </span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Textarea
        id={id}
        ref={ref}
        value={value}
        rows={rows}
        onChange={(event) => {
          remember(event);
          onChange(event.target.value);
        }}
        onSelect={remember}
        onBlur={remember}
        className="font-mono text-xs leading-relaxed"
      />
    </div>
  );
}

/**
 * What the bot may do besides reply.
 *
 * Chosen ones are listed above the buttons rather than shown as pressed
 * buttons, because "what has this bot been allowed to do" is the question you
 * arrive with, and reading it off a row of seven buttons means checking each
 * one. Each is removable from where it is listed.
 */
function ActionPicker({
  value,
  onChange,
  booking,
  onSaveBooking,
  triggers,
  onSaveTriggers,
  contactFields,
  onSaveContactFields,
  automations,
}: {
  value: BotActionKind[];
  onChange: (actions: BotActionKind[]) => void;
  booking: BookingSettings;
  /** Both at once: the dialog is also how the action gets added. */
  onSaveBooking: (booking: BookingSettings, actions: BotActionKind[]) => void;
  triggers: AutomationTrigger[];
  onSaveTriggers: (
    triggers: AutomationTrigger[],
    actions: BotActionKind[],
  ) => void;
  contactFields: ContactFieldUpdate[];
  onSaveContactFields: (
    contactFields: ContactFieldUpdate[],
    actions: BotActionKind[],
  ) => void;
  /** The account's real automations, handed to both dialogs. */
  automations: AutomationOption[];
}) {
  // Which dialog is open, or none. A boolean each would let two be true,
  // which is a state none of the dialogs has a story for.
  const [open, setOpen] = useState<ConfigurableAction | null>(null);

  function press(action: BotActionKind) {
    // Belt to the disabled button's braces. A card that cannot be pressed and
    // an action that cannot be added are two different claims, and only the
    // second is true of what the runtime can do.
    if (BOT_ACTIONS.find((item) => item.value === action)?.comingSoon) return;

    // The ones with something to set up open it, whether they are on the bot
    // or not — the same card is how you add one and how you go back to it.
    if (isConfigurable(action)) {
      setOpen(action);
      return;
    }

    onChange(
      value.includes(action)
        ? value.filter((item) => item !== action)
        : [...value, action],
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="min-w-0">
        <p className="text-xs font-medium">Actions</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          What this bot may do besides talk. Everything here is off until you
          add it.
        </p>
      </div>

      {/* One card per action, in one place, whether it is on or off. The
          alternative — chips above for the chosen ones and cards below for
          the rest — makes an action move house when you add it, and you then
          have to go and find it again to change it. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {BOT_ACTIONS.map((action) => {
          const on = value.includes(action.value);
          const configurable = isConfigurable(action.value);
          const soon = action.comingSoon === true;

          return (
            <div
              key={action.value}
              className={cn(
                "group focus-within:ring-ring/50 relative flex flex-col gap-0.5 rounded-lg border p-3 transition-colors focus-within:ring-3",
                // Dashed is the whole signal for "not added yet". Solid, with
                // a tinted ground, is what an added one looks like.
                on
                  ? "border-primary/40 bg-primary/5"
                  : "border-dashed",
                // Dimmed rather than hidden: knowing what is coming is why
                // someone waits instead of building a workaround. The dead
                // button is what says no.
                soon ? "bg-muted/20" : !on && "hover:bg-muted/30",
              )}
            >
              <button
                type="button"
                disabled={soon}
                onClick={() => press(action.value)}
                // The label carries the click for the whole card through its
                // own overlay, so the hint is clickable too without nesting a
                // button inside a button — which is what the remove control
                // would otherwise be.
                className={cn(
                  "flex items-center gap-1.5 text-left text-xs font-medium outline-none after:absolute after:inset-0 after:rounded-lg",
                  soon && "text-muted-foreground",
                )}
              >
                {soon ? (
                  <Clock className="size-3" />
                ) : on ? (
                  <Check className="text-primary size-3" />
                ) : (
                  <Plus className="size-3" />
                )}
                {action.label}
                {on && configurable && (
                  <span className="sr-only"> — edit settings</span>
                )}
              </button>

              <span className="text-muted-foreground pr-5 text-xs leading-relaxed">
                {action.hint}
              </span>

              {soon && (
                <Badge
                  variant="outline"
                  className="text-muted-foreground mt-1.5 self-start"
                >
                  Coming soon
                </Badge>
              )}

              {on && (
                <button
                  type="button"
                  aria-label={`Remove ${action.label}`}
                  onClick={() =>
                    onChange(value.filter((item) => item !== action.value))
                  }
                  className="text-muted-foreground hover:text-foreground absolute top-2.5 right-2.5 z-10"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <BookingDialog
        open={open === "book"}
        onOpenChange={(next) => setOpen(next ? "book" : null)}
        booking={booking}
        automations={automations}
        onSave={(next) => {
          // Saving is also how the action gets added — the dialog is what a
          // click on the card opens, so backing out of it has to mean the
          // action was never added.
          onSaveBooking(
            next,
            value.includes("book") ? value : [...value, "book"],
          );
          setOpen(null);
        }}
        onRemove={() => {
          onChange(value.filter((item) => item !== "book"));
          setOpen(null);
        }}
      />

      <AutomationDialog
        open={open === "workflow"}
        onOpenChange={(next) => setOpen(next ? "workflow" : null)}
        triggers={triggers}
        automations={automations}
        onSave={(next) => {
          onSaveTriggers(
            next,
            value.includes("workflow") ? value : [...value, "workflow"],
          );
          setOpen(null);
        }}
        onRemove={() => {
          onChange(value.filter((item) => item !== "workflow"));
          setOpen(null);
        }}
      />

      <ContactFieldsDialog
        open={open === "contact_info"}
        onOpenChange={(next) => setOpen(next ? "contact_info" : null)}
        updates={contactFields}
        onSave={(next) => {
          onSaveContactFields(
            next,
            value.includes("contact_info")
              ? value
              : [...value, "contact_info"],
          );
          setOpen(null);
        }}
        onRemove={() => {
          onChange(value.filter((item) => item !== "contact_info"));
          setOpen(null);
        }}
      />
    </div>
  );
}

/**
 * The actions that open a dialog rather than toggling on the spot.
 *
 * A list rather than a condition repeated at each site, because three places
 * ask the question — the click handler, the card, and the set of dialogs
 * below — and the third is the one that would be forgotten.
 */
const CONFIGURABLE = ["book", "workflow", "contact_info"] as const;

type ConfigurableAction = (typeof CONFIGURABLE)[number];

function isConfigurable(action: BotActionKind): action is ConfigurableAction {
  return (CONFIGURABLE as readonly BotActionKind[]).includes(action);
}
