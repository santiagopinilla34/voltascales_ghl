"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  Copy,
  Hash,
  Pencil,
  Plus,
  Search,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";

import {
  createPipeline,
  deletePipeline,
  duplicatePipeline,
  updatePipeline,
} from "@/app/(app)/pipeline/actions";
import { PipelineEditorDialog } from "@/components/pipeline/pipeline-editor-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatFullTimestamp } from "@/lib/format";
import { stageColorClasses } from "@/lib/pipeline-colors";
import type { PipelineSummary } from "@/lib/pipelines";

const PAGE_SIZES = [10, 20, 50];

/**
 * The list of pipelines, and everything that changes one.
 *
 * Rows arrive from the server and every write goes through a Server Action
 * that revalidates this path, so the list is never patched locally — what you
 * see after a change is what the database returned, not what this component
 * guessed it would return.
 */
export function PipelinesPanel({
  pipelines,
}: {
  pipelines: PipelineSummary[];
}) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();

  // The pipeline open in the editor, "new" while creating, or null when the
  // editor is closed.
  const [editing, setEditing] = useState<PipelineSummary | "new" | null>(null);
  const [confirmingDelete, setConfirmingDelete] =
    useState<PipelineSummary | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pipelines;
    return pipelines.filter((pipeline) =>
      pipeline.name.toLowerCase().includes(needle),
    );
  }, [pipelines, query]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const start = current * pageSize;
  const visible = rows.slice(start, start + pageSize);

  function runDuplicate(pipeline: PipelineSummary) {
    startTransition(async () => {
      const result = await duplicatePipeline(pipeline.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Duplicated “${pipeline.name}”`);
    });
  }

  function runDelete() {
    const pipeline = confirmingDelete;
    if (!pipeline) return;

    startTransition(async () => {
      const result = await deletePipeline(pipeline.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted “${pipeline.name}”`);
      setConfirmingDelete(null);
    });
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Pipelines</h2>
          <p className="text-muted-foreground mt-1 max-w-prose text-sm">
            Pipelines help you manage Opportunities step by step, giving you a
            clear view of progress and sales outcomes.
          </p>
        </div>

        <Button
          size="lg"
          onClick={() => setEditing("new")}
          className="bg-emerald-600 text-white hover:bg-emerald-500"
        >
          <Plus className="size-4" />
          Create Pipeline
        </Button>
      </div>

      <div className="bg-card/40 min-w-0 overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative w-full min-w-0 sm:w-72">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Search"
              aria-label="Search pipelines"
              className="h-9 pl-9"
            />
          </div>
        </div>

        <div className="min-w-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">
                  <span className="flex items-center gap-1.5">
                    <Type aria-hidden className="size-3.5" />
                    Pipeline Name
                  </span>
                </TableHead>
                <TableHead>
                  <span className="flex items-center gap-1.5">
                    <Hash aria-hidden className="size-3.5" />
                    No. of Stages
                  </span>
                </TableHead>
                <TableHead>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays aria-hidden className="size-3.5" />
                    Updated on
                  </span>
                </TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-muted-foreground h-28 text-center text-sm"
                  >
                    {query.trim()
                      ? "No pipelines match that search."
                      : "No pipelines yet."}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((pipeline) => (
                  <TableRow key={pipeline.id}>
                    <TableCell className="py-3 pl-4">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <span className="font-medium">{pipeline.name}</span>

                        {/* The stages themselves, in board order. The count in
                            the next column answers "how many"; this answers
                            "which", which is the question someone scanning a
                            list of pipelines actually has. */}
                        <div className="flex flex-wrap items-center gap-1">
                          {pipeline.stages.map((stage) => {
                            const colors = stageColorClasses(
                              stage.color,
                              pipeline.colorMode,
                            );

                            return (
                              <span
                                key={stage.id}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-[11px] leading-4",
                                  colors.surface ??
                                    "text-muted-foreground bg-muted/50",
                                )}
                              >
                                {colors.dot && (
                                  <span
                                    aria-hidden
                                    className={cn(
                                      "size-1.5 rounded-full",
                                      colors.dot,
                                    )}
                                  />
                                )}
                                {stage.name}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 align-top tabular-nums">
                      {pipeline.stages.length}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-3 align-top text-sm">
                      {formatFullTimestamp(pipeline.updatedAt)}
                    </TableCell>
                    <TableCell className="py-3 pr-4 align-top">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          onClick={() => setEditing(pipeline)}
                          disabled={pending}
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">Edit {pipeline.name}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          onClick={() => runDuplicate(pipeline)}
                          disabled={pending}
                        >
                          <Copy className="size-4" />
                          <span className="sr-only">
                            Duplicate {pipeline.name}
                          </span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmingDelete(pipeline)}
                          disabled={pending}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">
                            Delete {pipeline.name}
                          </span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(next) => {
                setPageSize(Number(next));
                setPage(0);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-18"
                aria-label="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="tabular-nums">
              {rows.length === 0
                ? "0 of 0"
                : `${start + 1} – ${start + visible.length} of ${rows.length}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <span className="tabular-nums">
              Page {current + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <PipelineEditorDialog
        open={editing !== null}
        onOpenChange={(next) => !next && setEditing(null)}
        pipeline={editing === "new" ? null : editing}
        onSubmit={async (input) => {
          const result =
            editing === "new" || editing === null
              ? await createPipeline(input)
              : await updatePipeline(editing.id, input);

          return result.ok ? { ok: true } : { ok: false, error: result.error };
        }}
      />

      <Dialog
        open={confirmingDelete !== null}
        onOpenChange={(next) => !next && !pending && setConfirmingDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this pipeline?</DialogTitle>
            <DialogDescription>
              “{confirmingDelete?.name}” and its{" "}
              {confirmingDelete?.stages.length ?? 0} stages are removed. No
              contact is deleted, and nothing moves off the board.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmingDelete(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={runDelete}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
