"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowUpDown,
  BookOpen,
  Loader2,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { deleteKnowledgeBase } from "@/app/(app)/ai-agents/knowledge-base/actions";
import { CreateKnowledgeBaseButton } from "@/components/knowledge/create-knowledge-base-button";
import { KnowledgeBaseDialog } from "@/components/knowledge/knowledge-base-dialog";
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
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatFullTimestamp } from "@/lib/format";
import type { KnowledgeBase } from "@/types/database";

/**
 * The list of knowledge bases, with everything you can do to one.
 *
 * Search and sort are done here rather than in the query, and that is a
 * deliberate consequence of the limit: fifteen rows is not a data set, it is a
 * list, and a round trip to reorder fifteen strings would be slower than the
 * keystroke that asked for it. If the limit ever moves into the hundreds this
 * is the thing to push back into Postgres.
 *
 * There is no column counting what is inside a base, because nothing is inside
 * one yet — articles are the next piece of work. A column that reads 0 for
 * every row on every account is worse than no column: it looks like a fact
 * about the base rather than a fact about the feature.
 */

type Sort = "recent" | "name" | "created";

const SORT_LABELS: Record<Sort, string> = {
  recent: "Last updated",
  name: "Name",
  created: "Newest first",
};

export function KnowledgeBaseList({
  bases,
  atLimit,
}: {
  bases: KnowledgeBase[];
  /** Whether another one may be created, decided on the server. */
  atLimit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  const [editing, setEditing] = useState<KnowledgeBase | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeBase | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matched = needle
      ? bases.filter((base) =>
          `${base.name} ${base.description ?? ""}`
            .toLowerCase()
            .includes(needle),
        )
      : bases;

    // Copied before sorting: `bases` is a prop, and sorting it in place would
    // mutate what the server rendered.
    return [...matched].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "created":
          return b.created_at.localeCompare(a.created_at);
        case "recent":
          return b.updated_at.localeCompare(a.updated_at);
      }
    });
  }, [bases, query, sort]);

  function confirmDelete() {
    if (!deleting) return;

    startTransition(async () => {
      const result = await deleteKnowledgeBase(deleting.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(`Deleted “${deleting.name}”`);
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-col rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowUpDown className="size-3.5" />
                {SORT_LABELS[sort]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(value) => setSort(value as Sort)}
              >
                {(Object.keys(SORT_LABELS) as Sort[]).map((option) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    {SORT_LABELS[option]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative w-full sm:w-64">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search knowledge bases"
              aria-label="Search knowledge bases"
              className="h-8 pl-8"
            />
          </div>
        </div>

        {bases.length === 0 ? (
          <Empty bases={bases} atLimit={atLimit} />
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground px-4 py-12 text-center text-sm">
            Nothing matches “{query}”.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                {/* Both dates are columns only while there is room for them.
                    A fixed 176px each left the name squeezed to about sixty
                    pixels on a phone -- "Pricing ..." -- which is the one
                    thing in the row that has to be readable. Below `sm` the
                    updated time moves under the name instead, and Created
                    goes entirely: it is the column you look at least, and the
                    sort order tells you most of it anyway. */}
                <TableHead className="hidden w-44 sm:table-cell">
                  Last updated
                </TableHead>
                <TableHead className="hidden w-44 md:table-cell">
                  Created
                </TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {shown.map((base) => (
                <TableRow key={base.id}>
                  <TableCell className="max-w-0">
                    <span className="flex flex-col gap-0.5">
                      <span className="truncate font-medium">{base.name}</span>
                      {base.description && (
                        <span className="text-muted-foreground truncate text-xs">
                          {base.description}
                        </span>
                      )}
                      <span className="text-muted-foreground truncate text-xs sm:hidden">
                        Updated {formatFullTimestamp(base.updated_at)}
                      </span>
                    </span>
                  </TableCell>

                  <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
                    {formatFullTimestamp(base.updated_at)}
                  </TableCell>

                  <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                    {formatFullTimestamp(base.created_at)}
                  </TableCell>

                  <TableCell>
                    <span className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${base.name}`}
                        onClick={() => setEditing(base)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${base.name}`}
                        onClick={() => setDeleting(base)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Mounted only while open, so it starts from the row it was opened on
          rather than from whatever it held last time. */}
      {editing && (
        <KnowledgeBaseDialog
          open
          onOpenChange={(next) => !next && setEditing(null)}
          existing={bases}
          base={editing}
        />
      )}

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this knowledge base?</DialogTitle>
            <DialogDescription>
              “{deleting?.name}” and everything in it goes for good. Any agent
              pointed at it loses those answers and will start saying it does
              not know.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleting(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** No bases yet. The one place on this page that says what these are for. */
function Empty({
  bases,
  atLimit,
}: {
  bases: KnowledgeBase[];
  atLimit: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
        <BookOpen className="size-4" />
      </span>

      <p className="text-sm font-medium">No knowledge bases yet</p>

      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        A knowledge base is what an agent is allowed to answer from — your
        prices, your hours, the questions you get asked every week. Until there
        is one, an agent has nothing to go on but the wording of its prompt.
      </p>

      <div className="pt-1">
        <CreateKnowledgeBaseButton bases={bases} atLimit={atLimit} />
      </div>
    </div>
  );
}
