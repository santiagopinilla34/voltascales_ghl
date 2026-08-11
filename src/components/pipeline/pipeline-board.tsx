"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, GripVertical, MoveRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { movePipelineEntry, removeFromPipeline } from "@/app/(app)/pipeline/actions";
import { StatusBadge } from "@/components/contacts/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PipelineColumn } from "@/lib/pipeline";
import { PIPELINE_STAGES } from "@/lib/pipeline-stages";
import { contactLabel, formatListTimestamp, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PipelineStage } from "@/types/database";

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
 */
export function PipelineBoard({ columns }: { columns: PipelineColumn[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // The card being dragged, and the column under the cursor. Both are local
  // hover state — the move itself goes through the server action.
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<PipelineStage | null>(null);

  const total = columns.reduce((sum, column) => sum + column.cards.length, 0);

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
        toast.error("Could not remove that card", { description: result.error });
        return;
      }
      toast.success(`${label} removed from the pipeline`, {
        description: "The contact itself is untouched.",
      });
      router.refresh();
    });
  }

  if (total === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        The pipeline is empty. Use <strong>Add to pipeline</strong> to put a
        contact on the board.
      </div>
    );
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto pb-2">
      {columns.map((column) => {
        const isTarget = overStage === column.stage && draggingEntryId !== null;

        return (
          <section
            key={column.stage}
            // `onDragOver` must preventDefault or the drop never fires — the
            // default for most elements is to reject the drop.
            onDragOver={(event) => {
              event.preventDefault();
              setOverStage(column.stage);
            }}
            onDragLeave={() => {
              setOverStage((current) =>
                current === column.stage ? null : current,
              );
            }}
            onDrop={(event) => {
              event.preventDefault();
              const entryId = event.dataTransfer.getData("text/plain");
              const from = event.dataTransfer.getData("application/x-stage");
              setOverStage(null);
              setDraggingEntryId(null);
              if (entryId) move(entryId, column.stage, from as PipelineStage);
            }}
            className={cn(
              "flex w-64 shrink-0 flex-col rounded-lg border transition-colors",
              isTarget ? "border-primary bg-primary/5" : "bg-muted/30",
            )}
            aria-label={column.label}
          >
            <header className="flex shrink-0 items-baseline justify-between gap-2 border-b px-3 py-2">
              <h2 className="truncate text-xs font-semibold tracking-tight">
                {column.label}
              </h2>
              <span className="text-muted-foreground text-xs tabular-nums">
                {column.cards.length}
              </span>
            </header>

            <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
              {column.cards.map((card) => {
                const label = contactLabel(card.contact);

                return (
                  <article
                    key={card.entryId}
                    draggable={!pending}
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
                      setOverStage(null);
                    }}
                    className={cn(
                      "bg-background group rounded-md border p-2 shadow-sm",
                      !pending && "cursor-grab active:cursor-grabbing",
                      draggingEntryId === card.entryId && "opacity-50",
                    )}
                  >
                    <div className="flex items-start gap-1">
                      <GripVertical
                        className="text-muted-foreground/40 mt-0.5 size-3.5 shrink-0"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{label}</p>
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

                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
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
                <p className="text-muted-foreground/50 px-1 py-6 text-center text-xs">
                  Drop here
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
