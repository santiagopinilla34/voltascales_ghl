"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  Loader2,
  MessagesSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteFaq,
  deleteFaqs,
} from "@/app/(app)/ai-agents/knowledge-base/[baseId]/faq/actions";
import { FaqDialog } from "@/components/knowledge/faq-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FAQ_LIMIT } from "@/lib/knowledge/faqs";
import { cn } from "@/lib/utils";
import type { KnowledgeFaq } from "@/types/database";

/**
 * The FAQ tab: the questions this base answers, and their answers.
 *
 * ## Why the rows collapse
 *
 * A crawled page gets a dialog to read its text in, because the text is a page
 * long and the table it sits in has four other columns. A FAQ answer is a
 * sentence or two and there is nothing else on the row, so it opens in place —
 * a dialog to read two lines is a click and a modal for something that could
 * just be there.
 *
 * Collapsed by default rather than open, because the list is scanned by
 * question. Twenty answers unfurled is a page nobody can find anything in, and
 * the question alone is what somebody is looking for when they arrive
 * wondering whether they already wrote this one down.
 *
 * ## Search matches answers too
 *
 * Not just questions, even though the question is what is on screen. Somebody
 * looking for "the deposit one" is remembering a word from the answer as often
 * as from the question, and a search that silently ignores half the text is a
 * search that says "no results" about a row three lines below.
 */

export function FaqPanel({
  baseId,
  faqs,
}: {
  baseId: string;
  faqs: KnowledgeFaq[];
}) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<KnowledgeFaq | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return faqs;

    return faqs.filter(
      (faq) =>
        faq.question.toLowerCase().includes(needle) ||
        faq.answer.toLowerCase().includes(needle),
    );
  }, [faqs, query]);

  const atLimit = faqs.length >= FAQ_LIMIT;

  function toggleOpen(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run(key: string, work: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    void work()
      .then((result) => {
        if (!result.ok && result.error) toast.error(result.error);
        else router.refresh();
      })
      .finally(() => setBusy(null));
  }

  function removeSelected() {
    const ids = [...selected];

    run("bulk", async () => {
      const result = await deleteFaqs(ids);
      if (result.ok) {
        setSelected(new Set());
        // Whatever was open among them is gone; leaving the ids behind would
        // silently re-expand a new FAQ that happened to reuse one.
        setOpen((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });
      }
      return result;
    });
  }

  /**
   * Bumped every time the dialog is opened, and used as its `key`.
   *
   * A counter rather than the FAQ's id, which was the obvious version and is
   * wrong: two new FAQs written one after the other both key on "new", so
   * React reuses the instance and the second one opens on the first one's
   * text. Keying on the *act of opening* is the thing that actually
   * guarantees a fresh form, and it leaves the dialog mounted while it closes
   * so the exit animation still runs.
   */
  const [formKey, setFormKey] = useState(0);

  function startEdit(faq: KnowledgeFaq) {
    setEditing(faq);
    setFormKey((key) => key + 1);
    setAdding(true);
  }

  function startAdd() {
    setEditing(undefined);
    setFormKey((key) => key + 1);
    setAdding(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight">FAQs</h3>
          <Badge variant="secondary" className="tabular-nums">
            {faqs.length}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {faqs.length > 0 && (
            <div className="relative w-full sm:w-56">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search FAQs"
                aria-label="Search FAQs"
                className="h-8 pl-8"
              />
            </div>
          )}

          <Button size="sm" onClick={startAdd} disabled={atLimit}>
            <Plus className="size-3.5" />
            Add FAQ
          </Button>
        </div>
      </div>

      {atLimit && (
        <p className="text-muted-foreground text-xs">
          This knowledge base is at its limit of {FAQ_LIMIT} questions. Delete
          some to make room.
        </p>
      )}

      {faqs.length === 0 ? (
        <EmptyState onAdd={startAdd} />
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-12 text-center text-sm">
          Nothing matches “{query}”.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <span className="text-xs tabular-nums">
                {selected.size} selected
              </span>
              <span className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={removeSelected}
                  disabled={busy === "bulk"}
                >
                  {busy === "bulk" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Delete
                </Button>
              </span>
            </div>
          )}

          {shown.map((faq) => (
            <FaqRow
              key={faq.id}
              faq={faq}
              open={open.has(faq.id)}
              selected={selected.has(faq.id)}
              busy={busy === faq.id}
              onToggleOpen={() => toggleOpen(faq.id)}
              onToggleSelected={() => toggleSelected(faq.id)}
              onEdit={() => startEdit(faq)}
              onDelete={() => run(faq.id, () => deleteFaq(faq.id))}
            />
          ))}
        </div>
      )}

      {/* Keyed per opening, so the dialog seeds its fields from props on mount
          instead of syncing them in an effect. See `formKey`. */}
      <FaqDialog
        key={formKey}
        open={adding}
        onOpenChange={(next) => {
          setAdding(next);
          if (!next) setEditing(undefined);
        }}
        baseId={baseId}
        faq={editing}
        existing={faqs}
      />
    </div>
  );
}

/**
 * One question, with its answer under it when it is open.
 *
 * The whole header is the disclosure control, not just the chevron — a row
 * where only a 14px triangle opens it is a row people click three times before
 * finding the part that works. The checkbox and the two actions stop the click
 * from reaching it, since selecting and deleting are not ways of reading.
 */
function FaqRow({
  faq,
  open,
  selected,
  busy,
  onToggleOpen,
  onToggleSelected,
  onEdit,
  onDelete,
}: {
  faq: KnowledgeFaq;
  open: boolean;
  selected: boolean;
  busy: boolean;
  onToggleOpen: () => void;
  onToggleSelected: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const answerId = `faq-answer-${faq.id}`;

  return (
    <div
      className={cn(
        "bg-muted/40 rounded-lg border transition-colors",
        selected && "border-primary/40 bg-muted/70",
      )}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <span
          className="flex h-5 shrink-0 items-center"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelected}
            aria-label={`Select “${faq.question}”`}
          />
        </span>

        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={answerId}
          className="min-w-0 flex-1 cursor-pointer text-left text-sm leading-5 font-medium"
        >
          {faq.question}
        </button>

        <span className="flex shrink-0 items-center gap-0.5">
          {/* Only once open: the actions belong to the answer you are looking
              at, and eight of them down a collapsed list is noise over the
              questions somebody came here to read. */}
          {open && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onEdit}
                aria-label={`Edit “${faq.question}”`}
              >
                <Pencil className="size-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                disabled={busy}
                aria-label={`Delete “${faq.question}”`}
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleOpen}
            aria-expanded={open}
            aria-controls={answerId}
            aria-label={open ? "Hide the answer" : "Show the answer"}
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                open && "rotate-180",
              )}
            />
          </Button>
        </span>
      </div>

      {open && (
        <p
          id={answerId}
          className="text-muted-foreground px-3 pt-1 pb-3 pl-10 text-sm leading-relaxed whitespace-pre-wrap"
        >
          {faq.answer}
        </p>
      )}
    </div>
  );
}

/** The tab before anybody has written a question down. */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-16 text-center">
      <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
        <MessagesSquare className="size-4" />
      </span>

      <p className="text-sm font-medium">No FAQs added yet</p>

      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        Add FAQs to help your agent answer common questions instantly.
      </p>

      <Button size="sm" className="mt-1" onClick={onAdd}>
        <Plus className="size-3.5" />
        Add FAQ
      </Button>
    </div>
  );
}
