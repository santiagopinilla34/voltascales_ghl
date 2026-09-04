"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ExternalLink,
  Filter,
  LayoutGrid,
  MoveRight,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  movePipelineEntry,
  removeFromPipeline,
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
import { PIPELINE_STAGES } from "@/lib/pipeline-stages";
import {
  contactLabel,
  formatListTimestamp,
  formatMoney,
  formatPhone,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Contact, PipelineStage } from "@/types/database";

type Candidate = Pick<Contact, "id" | "name" | "phone" | "business_name">;

/** What the columns are cut by. Only one of these can be dragged. */
type Grouping = "stage" | "status";

const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: "stage", label: "Stage" },
  { value: "status", label: "Status" },
];

type Column = {
  key: string;
  label: string;
  accent: string;
  /** Set only on a stage column, which is what makes it a drop target. */
  stage: PipelineStage | null;
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
}: {
  cards: PipelineCard[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<ContactStatusKey[]>([]);
  const [grouping, setGrouping] = useState<Grouping>("stage");

  // The card being dragged, and the column under the cursor. Both are local
  // hover state — the move itself goes through the server action.
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  // Which stage the picker will drop a contact into. Null means it is closed.
  const [addingTo, setAddingTo] = useState<PipelineStage | null>(null);

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

    return PIPELINE_STAGES.map((stage) => ({
      key: stage.value,
      label: stage.label,
      accent: stage.accent,
      stage: stage.value,
      cards: visible.filter((card) => card.stage === stage.value),
    }));
  }, [grouping, visible]);

  function move(entryId: string, stage: PipelineStage, from: PipelineStage) {
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
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pipeline..."
            aria-label="Search pipeline"
            autoComplete="off"
            className="border-input bg-input/30 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-56 rounded-lg border pr-3 pl-9 text-sm outline-none transition-colors focus-visible:ring-3"
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
            disabled={noCandidates}
            onClick={() => setAddingTo("interested")}
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
              {PIPELINE_STAGES.map((stage) => (
                <DropdownMenuItem
                  key={stage.value}
                  onSelect={() => setAddingTo(stage.value)}
                >
                  {stage.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto pb-2">
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
            <section
              key={column.key}
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
                const from = event.dataTransfer.getData("application/x-stage");
                setOverKey(null);
                setDraggingEntryId(null);
                if (entryId) {
                  move(entryId, column.stage, from as PipelineStage);
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

                  return (
                    <article
                      key={card.entryId}
                      draggable={!pending && grouping === "stage"}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", card.entryId);
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
                            {PIPELINE_STAGES.filter(
                              (stage) => stage.value !== card.stage,
                            ).map((stage) => (
                              <DropdownMenuItem
                                key={stage.value}
                                onSelect={() =>
                                  move(card.entryId, stage.value, card.stage)
                                }
                              >
                                {stage.label}
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

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
            </section>
          );
        })}
      </div>

      <AddToPipelineDialog
        candidates={candidates}
        stage={addingTo ?? "interested"}
        open={addingTo !== null}
        onOpenChange={(next) => {
          if (!next) setAddingTo(null);
        }}
      />
    </div>
  );
}
