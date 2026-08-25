"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createFaq,
  updateFaq,
} from "@/app/(app)/ai-agents/knowledge-base/[baseId]/faq/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ANSWER_MAX, QUESTION_MAX, normalizeQuestion } from "@/lib/knowledge/faqs";
import { cn } from "@/lib/utils";
import type { KnowledgeFaq } from "@/types/database";

/**
 * Writing a question-and-answer pair, or editing one.
 *
 * One component for both, like the knowledge base dialog and for the same
 * reason: the fields are the same two, and two dialogs that drift apart is how
 * a FAQ ends up editable into something it could not have been created as.
 *
 * Both fields are textareas, including the question. A question that runs to
 * two lines -- "Do you take same-day bookings, and is there a surcharge?" --
 * is a real question somebody types, and an input that scrolls sideways hides
 * the half you are checking.
 *
 * The taken-question check is done here as well as by the unique index. The
 * index is what makes it true; this is what makes it visible before you have
 * written an answer you are about to lose.
 */

export function FaqDialog({
  open,
  onOpenChange,
  baseId,
  faq,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseId: string;
  /** Editing this one, or writing a new one when absent. */
  faq?: KnowledgeFaq;
  /** Every question already on this base, for the taken-question check. */
  existing: KnowledgeFaq[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const editing = Boolean(faq);

  // Seeded once, and kept honest by the `key` the panel gives this component:
  // it changes on every opening, so a fresh copy is mounted rather than one
  // carrying the last thing somebody typed. An effect syncing state to props
  // would do the same job a render later and is the pattern React asks you not
  // to write.
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");

  const normalized = normalizeQuestion(question).toLowerCase();
  const taken = existing.some(
    (other) =>
      other.id !== faq?.id &&
      normalizeQuestion(other.question).toLowerCase() === normalized,
  );

  const tooLong = question.length > QUESTION_MAX || answer.length > ANSWER_MAX;
  const ready = Boolean(question.trim() && answer.trim()) && !taken && !tooLong;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    startTransition(async () => {
      const result = faq
        ? await updateFaq(faq.id, { question, answer })
        : await createFaq(baseId, { question, answer });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit FAQ" : "FAQs"}</DialogTitle>
            <DialogDescription>
              Write a question and answer pair to help your bot answer common
              questions.
            </DialogDescription>
          </DialogHeader>

          <Field
            id="faq-question"
            label="Question"
            placeholder="Your question goes here"
            value={question}
            onChange={setQuestion}
            max={QUESTION_MAX}
            rows={2}
            autoFocus
          />

          {taken && (
            <p className="text-destructive -mt-2 text-xs">
              That question is already on this knowledge base.
            </p>
          )}

          <Field
            id="faq-answer"
            label="Answer"
            placeholder="Your answer goes here"
            value={answer}
            onChange={setAnswer}
            max={ANSWER_MAX}
            rows={5}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || pending}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A textarea with its count in the corner.
 *
 * The label is visually hidden rather than absent. The placeholder says what
 * the box is for and that is enough to look at, but a screen reader reaching a
 * cleared field would otherwise find two unlabelled boxes and no way to tell
 * the question from the answer.
 *
 * `maxLength` is deliberately not set. Truncating as somebody pastes is how
 * you lose the last sentence of an answer without being told; the count turns
 * red instead and Save stays disabled until it is dealt with.
 */
function Field({
  id,
  label,
  placeholder,
  value,
  onChange,
  max,
  rows,
  autoFocus,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  rows: number;
  autoFocus?: boolean;
}) {
  const over = value.length > max;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>

      <div className="relative">
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          autoFocus={autoFocus}
          className="resize-y pb-7"
        />

        <span
          aria-live="polite"
          className={cn(
            "pointer-events-none absolute right-3 bottom-2 text-xs tabular-nums",
            over ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {value.length.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
