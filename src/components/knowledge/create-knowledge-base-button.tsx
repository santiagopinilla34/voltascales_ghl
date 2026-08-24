"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { KnowledgeBaseDialog } from "@/components/knowledge/knowledge-base-dialog";
import { Button } from "@/components/ui/button";
import { KNOWLEDGE_BASE_LIMIT } from "@/lib/knowledge/bases";
import type { KnowledgeBase } from "@/types/database";

/**
 * The Create button, wherever it appears.
 *
 * It is in two places — the header and the empty state — and each mounts its
 * own copy rather than sharing one dialog through a callback from the page.
 * Only one can be open at a time and neither holds anything worth preserving,
 * so the shared version would be a prop drill in exchange for nothing.
 *
 * At the limit it is disabled rather than absent. A button that has vanished
 * looks like a bug; a disabled one with a reason attached is a rule.
 */
export function CreateKnowledgeBaseButton({
  bases,
  atLimit,
  variant = "default",
}: {
  bases: KnowledgeBase[];
  atLimit: boolean;
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        disabled={atLimit}
        onClick={() => setOpen(true)}
        title={
          atLimit
            ? `You have the maximum of ${KNOWLEDGE_BASE_LIMIT} knowledge bases. Delete one to make room.`
            : undefined
        }
      >
        <Plus className="size-4" />
        Create knowledge base
      </Button>

      {open && (
        <KnowledgeBaseDialog open onOpenChange={setOpen} existing={bases} />
      )}
    </>
  );
}
