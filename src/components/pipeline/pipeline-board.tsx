"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChevronDown,
  ExternalLink,
  Filter,
  LayoutGrid,
  Loader2,
  MoveRight,
  Plus,
  Search,
  Workflow,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  movePipelineEntry,
  removeFromPipeline,
  setPipelineEntryValue,
} from "@/app/(app)/pipeline/actions";
import { ContactAvatar } from "@/components/contacts/contact-avatar";
import {
  STATUS_OPTIONS,
  StatusBadge,
  type ContactStatusKey,
} from "@/components/contacts/status-badge";
import { AddToPipelineDialog } from "@/components/pipeline/add-to-pipeline-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PipelineCard } from "@/lib/pipeline";
import type { PipelineSummary } from "@/lib/pipelines";
import { stageAccent, stageColorClasses } from "@/lib/pipeline-colors";
import {
  centsToMoneyInput,
  contactLabel,
  formatListTimestamp,
  formatMoney,
  formatPhone,
  parseMoneyToCents,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/database";

type Candidate = Pick<Contact, "id" | "name" | "phone" | "business_name">;

/** What the columns are cut by. Only one of these can be dragged. */
type Grouping = "stage" | "status";

const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: "stage", label: "Stage" },
  { value: "status", label: "Status" },
];

// ---------------------------------------------------------------------------
// Switching pipelines
// ---------------------------------------------------------------------------
//
// The same numbers as `--motion-ease` and the Inbox's `EXIT_MS`, restated here
// rather than imported: `components/inbox/motion.ts` says on its first line
// that it is the Inbox's vocabulary, and `app-sidebar.tsx` already sets the
// precedent of a component keeping its own copy of the curve.
//
// Motion rather than CSS for one reason: the old board has to *leave*. A
// pipeline switch replaces every column at once — different names, different
// count, different colours — and CSS cannot animate an element that React has
// already unmounted. `AnimatePresence` holding the outgoing board for 140ms is
// the whole reason this file imports a motion library at all.

/** `--motion-ease`, in the shape `motion` wants. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** The outgoing board fades as one block. Shorter than the entrance: you are
 *  already looking at what replaces it. */
const BOARD_OUT = { duration: 0.14, ease: EASE_OUT } as const;

/** One column arriving. Under 300ms, per column — the stagger is what gives
 *  the board its length, not any single column being slow. */
const COLUMN_IN = { duration: 0.2, ease: EASE_OUT } as const;

/** 30ms between columns: enough that the board deals in left to right rather
 *  than flashing on all at once, short enough that seven of them are done
 *  before anyone would call it a wait. */
const BOARD_VARIANTS = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.03 } },
  gone: { opacity: 0, transition: BOARD_OUT },
} as const;

const COLUMN_VARIANTS = {
  hidden: { opacity: 0, transform: "translateY(10px)" },
  shown: { opacity: 1, transform: "translateY(0px)", transition: COLUMN_IN },
} as const;

/** Motion sensitivity: the rise is the part that moves, so it goes. The
 *  crossfade stays, and the stagger collapses — a board dealing itself in one
 *  column at a time is still movement across the screen. */
const BOARD_VARIANTS_REDUCED = {
  hidden: {},
  shown: { transition: { staggerChildren: 0 } },
  gone: { opacity: 0, transition: { duration: 0.1 } },
} as const;

const COLUMN_VARIANTS_REDUCED = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.12 } },
} as const;

type Column = {
  key: string;
  label: string;
  accent: string;
  /** The stage's name, set only on a stage column — what makes it a drop target. */
  stage: string | null;
  cards: PipelineCard[];
};

/**
 * Kanban board for the pipeline.
 *
 * Dragging is native HTML5 drag-and-drop rather than a library: moving a card
 * between columns is the whole interaction, and it doesn't justify a dependency.
 *
 * Every card also carries a "Move to" menu, and that is not a nicety — HTML5
 * drag events never fire on touch, so on a phone the menu is the only way to
 * move anything. It is also the keyboard path. Drag is the shortcut; the menu
 * is the feature.
 *
 * Search and the status filter narrow the cards, never the columns: a stage
 * that filters down to nothing still shows, because an empty column is the
 * board answering "nothing is sitting here", and hiding it hides the answer.
 */
export function PipelineBoard({
  cards,
  candidates,
  pipelines,
  pipeline,
}: {
  cards: PipelineCard[];
  candidates: Candidate[];
  /** Every pipeline in the organization, for the picker. */
  pipelines: PipelineSummary[];
  /** The one being shown. Its stages are the columns. */
  pipeline: PipelineSummary;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const reduce = useReducedMotion();

  // Which pipeline the picker was last asked for.
  //
  // Switching is a navigation, and Next keeps the current board mounted until
  // the new one is ready — which is correct, but it means a click is followed
  // by a few hundred milliseconds in which the screen says nothing at all. The
  // board goes quiet and the picker names where it is going, so the wait reads
  // as the switch already happening rather than as a click that missed.
  const [requested, setRequested] = useState<string | null>(null);

  // Derived, not reset: the wait is over precisely when the pipeline being
  // asked for is the one being rendered, and that is a comparison rather than
  // a thing to remember to clear. Nothing has to notice the arrival — not an
  // effect, and not the picker, which is just as well because a switch can
  // also be ended by the back button or a link from somewhere else.
  const switchingTo = requested !== pipeline.id ? requested : null;

  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<ContactStatusKey[]>([]);
  const [grouping, setGrouping] = useState<Grouping>("stage");

  // The card being dragged, and the column under the cursor. Both are local
  // hover state — the move itself goes through the server action.
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  // Which stage the picker will drop a contact into. Null means it is closed.
  const [addingTo, setAddingTo] = useState<string | null>(null);

  // Which card's value is being typed into, and what has been typed.
  //
  // Board-level like the drag state above, and for a related reason: the card
  // being edited has to stop being draggable while its box is open. An HTML5
  // drag that starts on a text field eats the click that would have placed the
  // cursor, so the field cannot be edited at all.
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [valueDraft, setValueDraft] = useState("");

  // Escape has to beat the blur that follows it. A ref rather than state
  // because blur fires before a re-render would carry the flag.
  const cancelledEdit = useRef(false);

  // The first column is where "Add to pipeline" puts someone with no stage
  // named, and what the board falls back to when a pipeline has none at all.
  const firstStage = pipeline.stages[0]?.name ?? null;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return cards.filter((card) => {
      if (
        statuses.length > 0 &&
        !statuses.includes(card.contact.status as ContactStatusKey)
      ) {
        return false;
      }
      if (!needle) return true;

      return [
        card.contact.name,
        card.contact.business_name,
        card.contact.phone,
        formatPhone(card.contact.phone),
        ...card.contact.tags,
      ]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle));
    });
  }, [cards, query, statuses]);

  const columns = useMemo<Column[]>(() => {
    if (grouping === "status") {
      return STATUS_OPTIONS.map((status) => ({
        key: status.value,
        label: status.label,
        // Status already has a colour, on the badge inside every card. A second
        // set of them along the column rims would only say it louder.
        accent: "from-muted-foreground/40 to-transparent",
        stage: null,
        cards: visible.filter((card) => card.contact.status === status.value),
      }));
    }

    return pipeline.stages.map((stage) => ({
      key: stage.id,
      label: stage.name,
      accent: stageAccent(stage.color, pipeline.colorMode),
      stage: stage.name,
      // By name, which is what the card stores. Renaming a stage cascades onto
      // its cards in the same statement, so these cannot drift apart.
      cards: visible.filter((card) => card.stage === stage.name),
    }));
  }, [grouping, visible, pipeline]);

  function move(entryId: string, stage: string, from: string) {
    if (stage === from) return;

    startTransition(async () => {
      const result = await movePipelineEntry(entryId, stage);

      if (!result.ok) {
        toast.error("Could not move that card", { description: result.error });
        return;
      }
      router.refresh();
    });
  }

  /**
   * Commits whatever is in the open value box.
   *
   * Refusing rather than rounding a bad string to zero: someone who typed
   * "fifteen hundred" meant something, and silently storing nothing loses it.
   * The box stays shut either way — the error says what happened, and the card
   * still shows the value that is actually stored.
   */
  function saveValue(entryId: string, current: number) {
    const cents = parseMoneyToCents(valueDraft);
    setEditingValue(null);

    if (cents === null) {
      toast.error("That is not an amount", {
        description: "Digits only, with cents if you need them.",
      });
      return;
    }
    // Opening a box and closing it again is not an edit.
    if (cents === current) return;

    startTransition(async () => {
      const result = await setPipelineEntryValue(entryId, cents);

      if (!result.ok) {
        toast.error("Could not save that value", { description: result.error });
        return;
      }
      router.refresh();
    });
  }

  function remove(entryId: string, label: string) {
    startTransition(async () => {
      const result = await removeFromPipeline(entryId);

      if (!result.ok) {
        toast.error("Could not remove that card", {
          description: result.error,
        });
        return;
      }
      toast.success(`${label} removed from the pipeline`, {
        description: "The contact itself is untouched.",
      });
      router.refresh();
    });
  }

  const noCandidates = candidates.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-center gap-4">
        {/* Which pipeline this board is showing. It sits where the search box
            used to, because it is the control that decides what everything
            else on the screen means — the columns, the cards, the counts. */}
        <PipelinePicker
          pipelines={pipelines}
          current={pipeline}
          switchingTo={switchingTo}
          onPick={setRequested}
        />

        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search deals..."
            aria-label="Search deals on this pipeline"
            autoComplete="off"
            className="border-input bg-input/30 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-48 rounded-lg border pr-3 pl-9 text-sm outline-none transition-colors focus-visible:ring-3"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="lg" className="h-10 gap-2.5 px-4">
              <Filter className="size-3.5" />
              Filter
              {statuses.length > 0 && (
                <span className="text-muted-foreground tabular-nums">
                  {statuses.length}
                </span>
              )}
              <ChevronDown className="text-muted-foreground size-3.5" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {STATUS_OPTIONS.map((status) => (
              <DropdownMenuCheckboxItem
                key={status.value}
                checked={statuses.includes(status.value)}
                // Radix closes the menu on select, and a filter list you have
                // to reopen between ticks is one nobody uses twice.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  setStatuses((current) =>
                    checked
                      ? [...current, status.value]
                      : current.filter((value) => value !== status.value),
                  )
                }
              >
                {status.label}
              </DropdownMenuCheckboxItem>
            ))}

            {statuses.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setStatuses([])}>
                  Clear filter
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="lg" className="h-10 gap-2.5 px-4">
              <LayoutGrid className="size-3.5" />
              Group by:{" "}
              {GROUPINGS.find((entry) => entry.value === grouping)?.label}
              <ChevronDown className="text-muted-foreground size-3.5" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={grouping}
              onValueChange={(value) => setGrouping(value as Grouping)}
            >
              {GROUPINGS.map((entry) => (
                <DropdownMenuRadioItem key={entry.value} value={entry.value}>
                  {entry.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Split button: the face adds to Interested, the chevron picks the
            stage. Joined rather than set side by side, because they are one
            action with a default rather than two things to choose between. */}
        <div className="ml-auto flex">
          <Button
            type="button"
            size="lg"
            disabled={noCandidates || firstStage === null}
            onClick={() => firstStage && setAddingTo(firstStage)}
            className="h-10 gap-2.5 rounded-r-none bg-emerald-800 px-6 text-white hover:bg-emerald-700"
          >
            <Plus className="size-4" />
            Add to pipeline
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="lg"
                disabled={noCandidates}
                aria-label="Add to a specific stage"
                className="h-10 w-10 rounded-l-none border-l border-emerald-950/40 bg-emerald-800 px-0 text-white hover:bg-emerald-700"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Add to</DropdownMenuLabel>
              {pipeline.stages.map((stage) => (
                <DropdownMenuItem
                  key={stage.id}
                  onSelect={() => setAddingTo(stage.name)}
                >
                  {stage.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* The scroll region stays put; the board inside it is what is replaced.
          Dimming while a switch is in flight rather than blanking: the columns
          you are leaving are still true until the new ones land, and a board
          that empties itself and then fills reads as two changes. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 overflow-x-auto pb-2 transition-opacity duration-150 ease-out",
          switchingTo !== null && "opacity-60",
        )}
      >
        {/* `mode="wait"` so the two boards never overlap — they have different
            column counts and different widths, and crossfading them on top of
            each other is a smear rather than a transition. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pipeline.id}
            variants={reduce ? BOARD_VARIANTS_REDUCED : BOARD_VARIANTS}
            initial="hidden"
            animate="shown"
            exit="gone"
            // `shrink-0` so the row keeps the width of its columns instead of
            // being squashed to the scroll container — this div is now the
            // thing that overflows.
            className="flex min-h-0 w-full flex-1 shrink-0 gap-2.5"
          >
            {columns.map((column) => {
              const isTarget =
                overKey === column.key &&
                draggingEntryId !== null &&
                column.stage !== null;

              const total = column.cards.reduce(
                (sum, card) => sum + card.valueCents,
                0,
              );

              return (
                <motion.section
                  key={column.key}
                  variants={reduce ? COLUMN_VARIANTS_REDUCED : COLUMN_VARIANTS}
                  // `onDragOver` must preventDefault or the drop never fires — the
                  // default for most elements is to reject the drop.
                  onDragOver={(event) => {
                    if (!column.stage) return;
                    event.preventDefault();
                    setOverKey(column.key);
                  }}
                  onDragLeave={() => {
                    setOverKey((current) =>
                      current === column.key ? null : current,
                    );
                  }}
                  onDrop={(event) => {
                    if (!column.stage) return;
                    event.preventDefault();
                    const entryId = event.dataTransfer.getData("text/plain");
                    const from = event.dataTransfer.getData(
                      "application/x-stage",
                    );
                    setOverKey(null);
                    setDraggingEntryId(null);
                    if (entryId) {
                      move(entryId, column.stage, from);
                    }
                  }}
                  className={cn(
                    "bg-card/60 flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border transition-colors",
                    isTarget && "border-primary bg-primary/5",
                  )}
                  aria-label={column.label}
                >
                  <div
                    aria-hidden
                    className={cn(
                      "h-1 shrink-0 bg-gradient-to-r",
                      column.accent,
                    )}
                  />

                  <header className="shrink-0 px-3.5 pt-4 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate text-sm font-semibold tracking-tight">
                        {column.label}
                      </h2>
                      <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-[11px] leading-4 tabular-nums">
                        {column.cards.length}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1.5 text-xs tabular-nums">
                      {formatMoney(total)}
                    </p>
                  </header>

                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5">
                    {column.cards.map((card) => {
                      const label = contactLabel(card.contact);
                      const editing = editingValue === card.entryId;

                      return (
                        <article
                          key={card.entryId}
                          draggable={
                            !pending && grouping === "stage" && !editing
                          }
                          onDragStart={(event) => {
                            event.dataTransfer.setData(
                              "text/plain",
                              card.entryId,
                            );
                            event.dataTransfer.setData(
                              "application/x-stage",
                              card.stage,
                            );
                            event.dataTransfer.effectAllowed = "move";
                            setDraggingEntryId(card.entryId);
                          }}
                          onDragEnd={() => {
                            setDraggingEntryId(null);
                            setOverKey(null);
                          }}
                          className={cn(
                            "bg-card group shrink-0 rounded-lg border p-3 shadow-sm",
                            !pending &&
                              !editing &&
                              grouping === "stage" &&
                              "cursor-grab active:cursor-grabbing",
                            draggingEntryId === card.entryId && "opacity-50",
                          )}
                        >
                          <div className="flex items-start gap-2.5">
                            <ContactAvatar
                              contact={card.contact}
                              className="size-8"
                            />

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">
                                {label}
                              </p>
                              {card.contact.business_name && (
                                <p className="text-muted-foreground truncate text-xs">
                                  {card.contact.business_name}
                                </p>
                              )}
                              <p className="text-muted-foreground truncate text-xs tabular-nums">
                                {formatPhone(card.contact.phone)}
                              </p>
                            </div>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-6 shrink-0"
                                  disabled={pending}
                                  aria-label={`Move or remove ${label}`}
                                >
                                  <MoveRight className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>

                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                                {pipeline.stages
                                  .filter((stage) => stage.name !== card.stage)
                                  .map((stage) => (
                                    <DropdownMenuItem
                                      key={stage.id}
                                      onSelect={() =>
                                        move(
                                          card.entryId,
                                          stage.name,
                                          card.stage,
                                        )
                                      }
                                    >
                                      {stage.name}
                                    </DropdownMenuItem>
                                  ))}

                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link href={`/contacts/${card.contact.id}`}>
                                    <ExternalLink className="size-3.5" />
                                    Open contact
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => remove(card.entryId, label)}
                                >
                                  <Trash2 className="size-3.5" />
                                  Remove from pipeline
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Its own row rather than tucked in with the badges:
                              this is the figure the column header totals, so it
                              has to be readable straight down a stack of cards
                              without being hunted for. */}
                          <div className="mt-2.5">
                            {editing ? (
                              <div className="relative">
                                <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs">
                                  CA$
                                </span>
                                <input
                                  autoFocus
                                  value={valueDraft}
                                  onChange={(event) =>
                                    setValueDraft(event.target.value)
                                  }
                                  onBlur={() => {
                                    if (cancelledEdit.current) {
                                      cancelledEdit.current = false;
                                      setEditingValue(null);
                                      return;
                                    }
                                    saveValue(card.entryId, card.valueCents);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      event.currentTarget.blur();
                                    }
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      cancelledEdit.current = true;
                                      event.currentTarget.blur();
                                    }
                                  }}
                                  inputMode="decimal"
                                  autoComplete="off"
                                  aria-label={`What ${label}'s deal is worth, in dollars`}
                                  className="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-7 w-full rounded-md border pr-2 pl-10 text-sm font-semibold tabular-nums outline-none focus-visible:ring-3"
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => {
                                  setEditingValue(card.entryId);
                                  setValueDraft(
                                    // Empty rather than "0" for an unpriced
                                    // deal: the box should be ready to type
                                    // into, not ready to have a zero deleted.
                                    card.valueCents === 0
                                      ? ""
                                      : centsToMoneyInput(card.valueCents),
                                  );
                                }}
                                aria-label={`What ${label}'s deal is worth — ${formatMoney(card.valueCents)}. Click to change.`}
                                className={cn(
                                  "hover:bg-muted/60 -mx-1 flex h-7 items-center rounded-md px-1 tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-50",
                                  card.valueCents > 0
                                    ? "text-sm font-semibold text-emerald-400"
                                    : "text-muted-foreground text-xs",
                                )}
                              >
                                {card.valueCents > 0
                                  ? formatMoney(card.valueCents)
                                  : "Add value"}
                              </button>
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={card.contact.status} />
                            {card.contact.tags.slice(0, 2).map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="font-normal"
                              >
                                {tag}
                              </Badge>
                            ))}
                            <span className="text-muted-foreground/70 ml-auto text-[11px] tabular-nums">
                              {formatListTimestamp(card.stageChangedAt)}
                            </span>
                          </div>
                        </article>
                      );
                    })}

                    {column.cards.length === 0 && (
                      <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center">
                        <span className="bg-muted/50 mb-3 flex size-9 items-center justify-center rounded-lg border">
                          <Sparkles className="text-muted-foreground size-4" />
                        </span>
                        <p className="text-sm font-medium">No deals yet</p>
                        <p className="text-muted-foreground mt-1 max-w-[145px] text-xs leading-relaxed">
                          Drag and drop deals here or click below to add.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 p-2.5">
                    <button
                      type="button"
                      disabled={noCandidates || column.stage === null}
                      onClick={() => column.stage && setAddingTo(column.stage)}
                      className="text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground focus-visible:ring-ring/50 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Plus className="size-3.5" />
                      Add deal
                    </button>
                  </div>
                </motion.section>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <AddToPipelineDialog
        candidates={candidates}
        pipelineId={pipeline.id}
        stage={addingTo ?? firstStage ?? ""}
        open={addingTo !== null}
        onOpenChange={(next) => {
          if (!next) setAddingTo(null);
        }}
      />
    </div>
  );
}

/**
 * Chooses which pipeline the board shows.
 *
 * A link per pipeline rather than local state: the cards come from the server,
 * so switching has to reach it. Putting the choice in `?pipeline=` also makes a
 * particular board something you can send to someone, and survives the reload
 * after a card moves.
 */
function PipelinePicker({
  pipelines,
  current,
  switchingTo,
  onPick,
}: {
  pipelines: PipelineSummary[];
  current: PipelineSummary;
  /** The pipeline that has been asked for and has not arrived yet. */
  switchingTo: string | null;
  onPick: (id: string) => void;
}) {
  // The button names where the board is going the instant it is clicked, not
  // when the server gets round to it. Naming the destination is the feedback —
  // a spinner alone would say "something is happening" and leave the label
  // contradicting the click for as long as the query takes.
  const incoming =
    (switchingTo && pipelines.find((entry) => entry.id === switchingTo)) ||
    current;

  const waiting = switchingTo !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className="h-10 max-w-64 gap-2.5 px-4"
        >
          {waiting ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Workflow className="size-3.5 shrink-0" />
          )}
          <span className="truncate font-medium">{incoming.name}</span>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {incoming.stages.length}
          </span>
          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Pipeline</DropdownMenuLabel>

        {pipelines.map((entry) => {
          const colors = stageColorClasses(
            entry.stages[0]?.color ?? "slate",
            entry.colorMode,
          );

          return (
            <DropdownMenuItem key={entry.id} asChild>
              <Link
                href={`/pipeline?pipeline=${entry.id}`}
                // Still a link — middle-click and "open in new tab" are worth
                // keeping. The handler only records where we are headed; the
                // navigation itself is the browser's, as before. Picking the
                // pipeline already showing needs no guard: it is recorded and
                // then reads as "already here" in the same render.
                onClick={() => onPick(entry.id)}
                className={cn(
                  "flex items-center gap-2",
                  entry.id === current.id && "font-medium",
                )}
              >
                {colors.dot ? (
                  <span
                    aria-hidden
                    className={cn("size-2 shrink-0 rounded-full", colors.dot)}
                  />
                ) : (
                  <Workflow className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{entry.name}</span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                  {entry.stages.length}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
