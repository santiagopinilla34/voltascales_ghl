import { MessageCircleQuestion } from "lucide-react";

/**
 * The other half of a knowledge base: what it was asked and could not answer.
 *
 * Front end only. A gap is a real question a real person put to an agent that
 * this base had no answer for — which makes it the most useful list in the
 * product and the only one that cannot be invented, so there is nothing here
 * to show until agents are answering from bases and their misses are recorded.
 */
export default function KnowledgeGapsPage() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-16 text-center">
      <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
        <MessageCircleQuestion className="size-4" />
      </span>

      <p className="text-sm font-medium">No knowledge gaps yet</p>

      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        When someone asks an agent something this base cannot answer, the
        question lands here — in their words, not yours. It is the list to work
        through when you want to know what to add next.
      </p>
    </div>
  );
}
