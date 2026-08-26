"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ChevronDown,
  Minus,
  Plus,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { saveBot } from "@/app/(app)/ai-agents/conversation/actions";
import { GoalsPanel } from "@/components/ai-agents/goals-panel";
import { TrainingPanel } from "@/components/ai-agents/training-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  BOT_CHANNELS,
  BOT_CHANNEL_LABELS,
  BOT_KIND_LABELS,
  BOT_MODES,
  DESCRIPTION_MAX,
  MAX_MESSAGES_MAX,
  MAX_MESSAGES_MIN,
  NAME_MAX,
  RESPONSE_STYLES,
  summaryProblem,
  WAIT_SECONDS_MAX,
  type AutomationOption,
  type BotChannel,
  type BotSettings,
  type ConversationBot,
} from "@/lib/ai-agents/bots";
import { formatPhone } from "@/lib/format";
import type { SmsNumber } from "@/lib/ai-agents/sms-numbers";
import { cn } from "@/lib/utils";
import type { KnowledgeBase } from "@/types/database";

/**
 * The whole of one agent, on one screen.
 *
 * Creating and editing are the same component pointed at a different starting
 * bot, which is the same argument the dialog it replaces made and the reason
 * that dialog is gone: an agent has fifteen settings now, and a four-field
 * create form would have meant everything else being unreachable until after
 * you had made the thing.
 *
 * The draft is local until Save. Every control here writes to `draft` and
 * nothing reaches the list until the button at the bottom is pressed, so
 * Cancel is a real cancel rather than an undo of things already applied —
 * which matters most on the settings a bot answers customers with.
 *
 * Save writes the bot and its child rows through a server action, and
 * a full reload still empties it. Nothing on this screen pretends otherwise.
 */

/** How the wait is typed, which is not how it is stored. */
type WaitUnit = "seconds" | "minutes";

export function AgentEditor({
  bot,
  bases,
  numbers,
  automations,
  isNew = false,
}: {
  bot: ConversationBot;
  /** The account's real knowledge bases, for the Training tab's triggers. */
  bases: KnowledgeBase[];
  /** The account's SMS-capable numbers, for the send-from picker. */
  numbers: SmsNumber[];
  /** The account's real automations, for the Goals tab's action dialogs. */
  automations: AutomationOption[];
  /** True on `/new`, where this bot has never been written. */
  isNew?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("settings");

  const [draft, setDraft] = useState<ConversationBot>(() =>
    // One number and nothing chosen is not a decision, it is the only
    // possibility — so it is applied rather than left as an empty select the
    // bot would silently fail on. Done once, on mount: doing it on every
    // render would undo a deliberate "none" the moment it was picked.
    bot.settings.sms_from === null && numbers.length === 1
      ? {
          ...bot,
          settings: { ...bot.settings, sms_from: numbers[0].phoneNumber },
        }
      : bot,
  );

  // Minutes is offered because "5 minutes" is easier to mean than "300", and
  // the box starts in whichever unit says the current value without a
  // remainder. Seconds when it is a round minute count is a fine default for
  // 0, which is what a new bot has.
  const [unit, setUnit] = useState<WaitUnit>(() =>
    draft.settings.wait_seconds > 0 && draft.settings.wait_seconds % 60 === 0
      ? "minutes"
      : "seconds",
  );

  // Whether this row is already in Postgres. Passed in rather than inferred:
  // the two routes know the answer for certain — `/new` invented this bot and
  // `/[botId]` read it back — and every way of guessing it from the row itself
  // is a coincidence waiting to stop being true.
  const known = !isNew;

  const trimmed = draft.name.trim();

  // The duplicate-name check moved to the server with the rest of validation:
  // the list of other bots is no longer in the browser, and the unique index
  // is the only thing that can answer it without a race anyway.

  // Asked of the same function the Goals tab shows its error from, so what
  // blocks Save and what the screen says are never two different rules.
  const summaryIssue = summaryProblem(
    draft.goals.conversation_summary,
    draft.goals.summary,
  );

  const blocked = !trimmed || summaryIssue !== null || saving;

  function patch(changes: Partial<ConversationBot>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function patchSettings(changes: Partial<BotSettings>) {
    setDraft((current) => ({
      ...current,
      settings: { ...current.settings, ...changes },
    }));
  }

  async function save() {
    if (blocked) return;

    setSaving(true);

    const result = await saveBot({
      ...draft,
      name: trimmed,
      description: draft.description?.trim() || null,
      updated_at: new Date().toISOString(),
    });

    if (!result.ok) {
      // Left on the screen with the draft intact. The server refuses things
      // the editor cannot check — a name taken since this page loaded, a
      // knowledge base deleted underneath a trigger — and the fix for all of
      // them is to change something here, not to start again.
      setSaving(false);
      toast.error(result.error);
      return;
    }

    toast.success(known ? "Agent saved" : `Created “${trimmed}”`);

    // Refresh before navigating: the list is a server component, and pushing
    // to a cached version of it is how a bot you just saved fails to appear.
    router.refresh();
    router.push("/ai-agents/conversation");
  }

  return (
    // No scroll container of its own: the AI Agents layout already owns one,
    // and a second nested inside it would give this screen two scrollbars and
    // leave the footer below pinned to the wrong box.
    <>
      <div>
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-10">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold tracking-tight">
                {known ? draft.name : "Create agent"}
                <Badge variant="secondary">{BOT_KIND_LABELS[draft.kind]}</Badge>
              </h2>
              <p className="text-muted-foreground text-xs">
                {known
                  ? "What this agent is, where it works, and how it behaves."
                  : "Nothing is written until you press Save."}
              </p>
            </div>
          </div>

          {/* Client-side tabs, unlike the four at the top of AI Agents, which
              are routes. These four are panels of one unsaved form: routing
              between them would throw the draft away every time you looked at
              the training tab to check something. */}
          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList>
              <TabsTrigger value="settings">Bot settings</TabsTrigger>
              <TabsTrigger value="training">Training</TabsTrigger>
              <TabsTrigger value="goals">Goals</TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="flex flex-col gap-4">
              <Section
                title="Bot details"
                hint="What it is called, and where it is allowed to answer."
                action={
                  draft.is_primary ? (
                    <Badge variant="outline">
                      <Star />
                      Primary bot
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      // Applied straight away rather than into the draft:
                      // exactly one bot may hold it, so it is a change to
                      // every other row as well, and a Cancel that silently
                      // demoted one of them would be a surprise.
                      disabled={!known}
                      title={
                        known
                          ? undefined
                          : "Save this agent first, then it can take over inbound messages."
                      }
                      // Marked on the draft rather than written now: Save is
                      // what promotes it, in the same transaction as the rest
                      // of the edit, so a Cancel cannot leave the account
                      // pointing at a bot whose changes were thrown away.
                      onClick={() => {
                        patch({ is_primary: true });
                        toast.success(
                          `“${draft.name}” will answer inbound messages once you save`,
                        );
                      }}
                    >
                      <Star className="size-4" />
                      Set as primary
                    </Button>
                  )
                }
              >
                <Field
                  label="Bot name"
                  htmlFor="agent-name"
                  required
                >
                  {/* Capped rather than filling the card. The card is as wide
                      as every other page's content, which is right, but a name
                      box a thousand pixels long reads as a paragraph field and
                      leaves the caret miles from the label. */}
                  <Input
                    id="agent-name"
                    value={draft.name}
                    maxLength={NAME_MAX}
                    onChange={(event) => patch({ name: event.target.value })}
                    className="max-w-xl"
                  />
                </Field>

                <Field
                  label="Description"
                  htmlFor="agent-description"
                  hint="Which conversations this one is for, so the next person knows which bot to edit."
                >
                  <Textarea
                    id="agent-description"
                    value={draft.description ?? ""}
                    maxLength={DESCRIPTION_MAX}
                    rows={2}
                    onChange={(event) =>
                      patch({ description: event.target.value })
                    }
                    className="max-w-xl"
                  />
                </Field>

                <Field
                  label="Bot status"
                  hint="How much it may do without you. Choose one."
                >
                  <CardRadioGroup
                    label="Bot status"
                    options={BOT_MODES}
                    value={draft.mode}
                    onChange={(mode) => patch({ mode })}
                  />
                </Field>

                <Field
                  label="Channels"
                  hint="Where this bot is active. One with none is saved but idle — nothing reaches it."
                >
                  <ChannelPicker
                    value={draft.channels}
                    onChange={(channels) => patch({ channels })}
                  />
                </Field>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5">
                  <p className="text-muted-foreground flex items-center gap-2 text-xs">
                    <Sparkles className="size-3.5 shrink-0" />
                    Try the bot against your knowledge base before letting it
                    near a customer. Nothing you send it reaches anyone.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTab("training")}
                  >
                    Open the test panel
                  </Button>
                </div>
              </Section>

              <Section
                title="Advanced settings"
                hint="Fine-tune how the bot behaves once it is answering."
              >
                <Field
                  label="Business name"
                  htmlFor="agent-business"
                  hint="What the bot calls your business. Leave it blank to use the account name."
                >
                  <Input
                    id="agent-business"
                    value={draft.settings.business_name}
                    placeholder="Your business name"
                    onChange={(event) =>
                      patchSettings({ business_name: event.target.value })
                    }
                    className="max-w-xl"
                  />
                </Field>

                <Field
                  label="Send SMS from"
                  htmlFor="agent-sms-from"
                  hint="The number texts from this bot arrive on. Only numbers that can send SMS are listed."
                >
                  <SmsFromPicker
                    value={draft.settings.sms_from}
                    numbers={numbers}
                    onChange={(sms_from) => patchSettings({ sms_from })}
                  />
                </Field>

                <div className="flex flex-col gap-3 border-t pt-4">
                  <p className="text-xs font-medium">Auto-pilot</p>

                  <Field
                    label="Wait before replying"
                    htmlFor="agent-wait"
                    hint="A pause so the bot does not answer faster than a person could have read the message."
                  >
                    <div className="flex gap-2">
                      <Input
                        id="agent-wait"
                        type="number"
                        min={0}
                        max={unit === "minutes" ? WAIT_SECONDS_MAX / 60 : WAIT_SECONDS_MAX}
                        value={
                          unit === "minutes"
                            ? draft.settings.wait_seconds / 60
                            : draft.settings.wait_seconds
                        }
                        onChange={(event) => {
                          const typed = Number(event.target.value);
                          if (Number.isNaN(typed)) return;

                          const seconds =
                            unit === "minutes" ? typed * 60 : typed;

                          patchSettings({
                            wait_seconds: clamp(seconds, 0, WAIT_SECONDS_MAX),
                          });
                        }}
                        className="w-28"
                      />

                      <Select
                        value={unit}
                        onValueChange={(next) => setUnit(next as WaitUnit)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="seconds">Seconds</SelectItem>
                          <SelectItem value="minutes">Minutes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </Field>

                  <Field
                    label="Most messages in one conversation"
                    hint="A stop, so a bot that misreads a thread cannot send fifty messages into it."
                  >
                    <Stepper
                      value={draft.settings.max_messages}
                      min={MAX_MESSAGES_MIN}
                      max={MAX_MESSAGES_MAX}
                      onChange={(max_messages) => patchSettings({ max_messages })}
                    />
                  </Field>

                  <Toggle
                    label="Reply to images"
                    hint="Replies to photos take longer, and only auto-pilot can send them."
                    checked={draft.settings.respond_to_images}
                    onChange={(respond_to_images) =>
                      patchSettings({ respond_to_images })
                    }
                  />

                  <Toggle
                    label="Reply to voice notes"
                    checked={draft.settings.respond_to_voice_notes}
                    onChange={(respond_to_voice_notes) =>
                      patchSettings({ respond_to_voice_notes })
                    }
                  />
                </div>

                <div className="flex flex-col gap-3 border-t pt-4">
                  <p className="text-xs font-medium">Going quiet</p>

                  <Toggle
                    label="Sleep when I send a message"
                    hint="Someone typing into the thread is the clearest sign the bot should stop."
                    checked={draft.settings.sleep_on_manual_message}
                    onChange={(sleep_on_manual_message) =>
                      patchSettings({ sleep_on_manual_message })
                    }
                  />

                  <Toggle
                    label="Sleep when an automation sends"
                    checked={draft.settings.sleep_on_workflow_message}
                    onChange={(sleep_on_workflow_message) =>
                      patchSettings({ sleep_on_workflow_message })
                    }
                  />
                </div>
              </Section>

              <Section
                title="Response settings"
                hint="How the replies read, once you want to shape them."
              >
                <Toggle
                  label="Response style"
                  hint="Set how long an answer should run. Off, the bot writes whatever length the question seems to want."
                  checked={draft.settings.response_style_enabled}
                  onChange={(response_style_enabled) =>
                    patchSettings({ response_style_enabled })
                  }
                />

                {/* Revealed by the switch rather than sitting there greyed out.
                    A disabled row of options is a puzzle — it says a choice
                    exists without saying what turns it on — and there is
                    nothing above it that needs explaining first. */}
                {draft.settings.response_style_enabled && (
                  <Field label="How long an answer should run">
                    <CardRadioGroup
                      label="Response style"
                      options={RESPONSE_STYLES}
                      value={draft.settings.response_style}
                      onChange={(response_style) =>
                        patchSettings({ response_style })
                      }
                    />
                  </Field>
                )}
              </Section>
            </TabsContent>

            {/* Panels rather than nothing, so the tab row is the real shape of
                this screen from the start — the same argument the unbuilt AI
                Agents tabs already make. */}
            <TabsContent value="training">
              <TrainingPanel
                bot={draft}
                triggers={draft.triggers}
                onChange={(triggers) => patch({ triggers })}
                bases={bases}
              />
            </TabsContent>

            <TabsContent value="goals">
              <GoalsPanel
                bot={draft}
                automations={automations}
                goals={draft.goals}
                onChange={(goals) => patch({ goals })}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Sticky to the layout's scroll region, because the settings run well
          past one screen and a Save you have to scroll to find is a Save
          people stop pressing. */}
      <footer className="bg-background sticky bottom-0 border-t px-4 py-3 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/ai-agents/conversation")}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={blocked}
            title={summaryIssue ?? undefined}>
            {known ? "Save changes" : "Create agent"}
          </Button>
        </div>
      </footer>
    </>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** One card of settings. */
function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </div>
        {action}
      </div>

      {children}
    </section>
  );
}

/** A labelled control, with its explanation under the label rather than after it. */
function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>

      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}

      {children}

      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

/** A switch with its label, laid out as a row you can read across. */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    // Capped like the text fields: the switch is pushed to the right edge of
    // this row, and across the full page width it ends up far enough from its
    // own label to read as belonging to something else.
    <Label className="flex max-w-2xl items-start justify-between gap-4 font-normal">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-medium">{label}</span>
        {hint && (
          <span className="text-muted-foreground text-xs leading-relaxed">
            {hint}
          </span>
        )}
      </span>

      <Switch checked={checked} onCheckedChange={onChange} />
    </Label>
  );
}

/**
 * Which number the bot texts from.
 *
 * Always a list, even when the account owns exactly one. A lone number shown
 * as a line of text reads as a fact you cannot change, and the first question
 * anybody asks on this screen is "can I use the other one?" — a select answers
 * that whether or not there is another one in it today. When there is only
 * one it arrives already chosen, so the list costs a click nobody has to make.
 *
 * No numbers at all is its own state rather than an empty dropdown. The fix is
 * on another screen, so it says so and links there.
 */
function SmsFromPicker({
  value,
  numbers,
  onChange,
}: {
  value: string | null;
  numbers: SmsNumber[];
  onChange: (phoneNumber: string | null) => void;
}) {
  if (numbers.length === 0) {
    return (
      <p className="text-muted-foreground max-w-xl rounded-lg border border-dashed px-3 py-2.5 text-xs leading-relaxed">
        No number on this account can send SMS.{" "}
        <Link
          href="/phone"
          className="hover:text-foreground underline underline-offset-2"
        >
          Phone System
        </Link>{" "}
        is where you buy one or check why an existing number cannot.
      </p>
    );
  }

  // A number can be released after a bot was pointed at it. Kept in the list
  // as a dead entry rather than silently swapped for another: sending would
  // have failed either way, and a bot quietly texting from a different number
  // than the one it was set to is worse than one that says it is broken.
  const missing = value !== null && !numbers.some((n) => n.phoneNumber === value);

  return (
    <div className="flex max-w-xl flex-col gap-1.5">
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger id="agent-sms-from" className="w-full">
          <SelectValue placeholder="Choose a number" />
        </SelectTrigger>

        <SelectContent>
          {missing && (
            <SelectItem value={value}>
              {formatPhone(value)} — no longer on this account
            </SelectItem>
          )}

          {numbers.map((number) => (
            <SelectItem key={number.phoneNumber} value={number.phoneNumber}>
              {formatPhone(number.phoneNumber)}
              {number.label && ` — ${number.label}`}
              {number.isMain && " — main line"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {missing && (
        <p className="text-destructive text-xs">
          This number is no longer on the account. Pick another one.
        </p>
      )}
    </div>
  );
}

/**
 * A row of cards you pick one of.
 *
 * Cards rather than a select wherever the options need a sentence each to be
 * understood — bot status and response style both do. A select hides all but
 * one of those sentences behind a click, at exactly the moment someone is
 * deciding between them.
 *
 * Generic over the value so the two callers keep their own union types: a
 * shared `string` would let a response style be assigned to the bot's mode.
 */
function CardRadioGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** Names the group for a screen reader, which sees no heading above it. */
  label: string;
  options: readonly { value: T; label: string; hint: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-2 sm:grid-cols-3", className)}
    >
      {options.map((option) => {
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "focus-visible:ring-ring/50 flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none",
              active
                ? "border-foreground bg-muted/50"
                : "hover:bg-muted/30 text-muted-foreground",
            )}
          >
            <span
              className={cn("text-xs font-medium", active && "text-foreground")}
            >
              {option.label}
            </span>
            <span className="text-muted-foreground text-xs leading-relaxed">
              {option.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Channels as removable chips over a checkbox menu.
 *
 * The chips are the answer to "where is this bot live?", which is the question
 * you open this screen with; the menu is how you change it. A row of six
 * checkboxes answers the same question but makes you read the unticked ones to
 * find out.
 */
function ChannelPicker({
  value,
  onChange,
}: {
  value: BotChannel[];
  onChange: (channels: BotChannel[]) => void;
}) {
  function toggle(channel: BotChannel, on: boolean) {
    onChange(
      on ? [...value, channel] : value.filter((item) => item !== channel),
    );
  }

  return (
    <div className="flex max-w-xl flex-wrap items-center gap-1.5 rounded-lg border p-1.5">
      {value.length === 0 && (
        <span className="text-muted-foreground px-1.5 text-xs">
          No channels
        </span>
      )}

      {/* Ordered by BOT_CHANNELS rather than by when each was ticked, so the
          chips do not reshuffle as you use the menu. */}
      {BOT_CHANNELS.filter((channel) => value.includes(channel.value)).map(
        (channel) => (
          <Badge key={channel.value} variant="outline" className="gap-1 pr-1">
            {channel.label}
            <button
              type="button"
              aria-label={`Remove ${channel.label}`}
              onClick={() => toggle(channel.value, false)}
              className="hover:text-foreground text-muted-foreground"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ),
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="ml-auto">
            Channels
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-44">
          {BOT_CHANNELS.map((channel) => (
            <DropdownMenuCheckboxItem
              key={channel.value}
              checked={value.includes(channel.value)}
              // Radix closes on select by default, which for a multi-select is
              // one channel per trip to the menu.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => toggle(channel.value, checked)}
            >
              {BOT_CHANNEL_LABELS[channel.value]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** A number you nudge, for a value people adjust rather than type. */
function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex w-40 items-center gap-1 rounded-lg border p-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Fewer messages"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1, min, max))}
      >
        <Minus />
      </Button>

      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const typed = Number(event.target.value);
          if (!Number.isNaN(typed)) onChange(clamp(typed, min, max));
        }}
        className="h-6 border-0 bg-transparent text-center tabular-nums shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="More messages"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1, min, max))}
      >
        <Plus />
      </Button>
    </div>
  );
}

