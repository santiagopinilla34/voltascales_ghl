"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ExternalLink,
  Info,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import { TriggerDialog } from "@/components/ai-agents/trigger-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type {
  ConversationBot,
  KnowledgeTrigger,
} from "@/lib/ai-agents/bots";
import { cn } from "@/lib/utils";
import type { KnowledgeBase } from "@/types/database";

/**
 * The Training tab: what the agent may answer from, and a place to try it.
 *
 * Two columns because they are two halves of one loop — you add a rule, you
 * ask the bot a question, you change the rule. Side by side you can see what
 * you just changed while you test it; stacked, testing means scrolling away
 * from the thing under test. Below `lg` they stack anyway, because a chat
 * panel three hundred pixels wide is not a chat panel.
 *
 * Triggers live in the draft above, so nothing here is saved until the
 * editor's Save — including for the test panel, which is handed the draft as
 * it stands rather than reading the saved bot back. Testing the saved version
 * of a prompt you have just rewritten is the one thing it must not do.
 */
export function TrainingPanel({
  bot,
  triggers,
  onChange,
  bases,
}: {
  /** The draft as it stands, for the test panel beside it. */
  bot: ConversationBot;
  triggers: KnowledgeTrigger[];
  onChange: (triggers: KnowledgeTrigger[]) => void;
  bases: KnowledgeBase[];
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<KnowledgeTrigger | null>(null);

  function upsert(trigger: KnowledgeTrigger) {
    const known = triggers.some((item) => item.id === trigger.id);

    onChange(
      known
        ? triggers.map((item) => (item.id === trigger.id ? trigger : item))
        : [...triggers, trigger],
    );

    setAdding(false);
    setEditing(null);
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex flex-col gap-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h3 className="text-sm font-medium">Knowledge base triggers</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                When each knowledge base should be used. Without a trigger the
                agent picks from everything it has, which is how a pricing
                question gets answered out of the onboarding notes.
              </p>
            </div>

            <Button asChild variant="outline" size="sm">
              <Link href="/ai-agents/knowledge-base">
                <ExternalLink className="size-4" />
                Create new
              </Link>
            </Button>
          </div>

          {triggers.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-xs leading-relaxed">
              No triggers yet. The agent will decide for itself which base to
              answer from.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {triggers.map((trigger, index) => (
                <TriggerCard
                  key={trigger.id}
                  trigger={trigger}
                  // Numbered by position rather than stored on the trigger: a
                  // stored number would go wrong the first time one is deleted.
                  index={index + 1}
                  bases={bases}
                  onEdit={() => setEditing(trigger)}
                  onDelete={() =>
                    onChange(triggers.filter((item) => item.id !== trigger.id))
                  }
                />
              ))}
            </ul>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-4" />
            Add knowledge base trigger
          </Button>
        </section>

        <TestPanel bot={bot} />
      </div>

      {/* Mounted only while open, so each starts from the trigger it was
          opened on rather than from whatever it held last time. */}
      {adding && (
        <TriggerDialog
          open
          onOpenChange={setAdding}
          onSubmit={upsert}
          bases={bases}
        />
      )}

      {editing && (
        <TriggerDialog
          open
          onOpenChange={(next) => !next && setEditing(null)}
          onSubmit={upsert}
          bases={bases}
          trigger={editing}
        />
      )}
    </>
  );
}

/** One rule, as it reads once it is made. */
function TriggerCard({
  trigger,
  index,
  bases,
  onEdit,
  onDelete,
}: {
  trigger: KnowledgeTrigger;
  index: number;
  bases: KnowledgeBase[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  // A base can be deleted from under a trigger that names it. Showing the id
  // would be noise, so it says what happened instead.
  const named = trigger.base_ids.map((id) => ({
    id,
    name: bases.find((base) => base.id === id)?.name,
  }));

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded">
            <BookOpen className="size-3" />
          </span>
          <span className="truncate text-xs font-medium">Trigger {index}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Actions for trigger ${index}`}
            >
              <MoreVertical className="size-3" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="size-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap gap-1">
        {named.map((base) =>
          base.name ? (
            <Badge key={base.id} variant="outline" className="max-w-56">
              <span className="truncate">{base.name}</span>
            </Badge>
          ) : (
            <Badge
              key={base.id}
              variant="ghost"
              className="text-muted-foreground"
              title="This knowledge base has been deleted."
            >
              Deleted base
            </Badge>
          ),
        )}
      </div>

      <div className="border-t pt-2">
        <p className="text-muted-foreground text-xs">When to use it</p>
        <p className="text-xs leading-relaxed">
          {trigger.instructions || (
            <span className="text-muted-foreground">
              Left to the agent to decide.
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

/**
 * Test your bot.
 *
 * Wired to the real thing: the same prompt composer the live reply path uses,
 * the same model call, the same knowledge. What it cannot do is send — the
 * route behind it does not import Twilio and writes no rows.
 *
 * The bot it tests is the *draft*, handed down from the editor, not the saved
 * row. Rewriting a prompt and testing the previous version is the one failure
 * this panel must not have, and reading the bot back by id is how it would.
 */
export function TestPanel({ bot }: { bot: ConversationBot }) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);

  // Scrolled on every turn, including the pending one, so a long answer does
  // not arrive below the fold of a panel you are already looking at.
  const tail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tail.current?.scrollIntoView({ block: "end" });
  }, [turns, thinking]);

  async function send(event: React.FormEvent) {
    event.preventDefault();

    const message = draft.trim();
    if (!message || thinking) return;

    // The transcript as the model will see it, built before the request so the
    // new message is in it — the route takes the whole conversation rather
    // than a message plus history, because that is what `generateAiReply`
    // takes and one shape is easier to keep honest than two.
    const next: Turn[] = [...turns, { role: "user", content: message }];

    setTurns(next);
    setDraft("");
    setThinking(true);

    try {
      const response = await fetch("/api/ai-agents/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot,
          conversation: next.map(({ role, content }) => ({ role, content })),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        // Kept in the thread rather than raised as a toast: it is the answer to
        // the message above it, and a toast disappears before you have read it
        // against what you asked.
        setTurns([
          ...next,
          { role: "assistant", content: payload.error ?? "That failed.", failed: true },
        ]);
        return;
      }

      setTurns([
        ...next,
        {
          role: "assistant",
          content: payload.reply,
          needsHuman: payload.needsHuman === true,
        },
      ]);
    } catch {
      setTurns([
        ...next,
        {
          role: "assistant",
          content: "Could not reach the agent. Check your connection.",
          failed: true,
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <section className="flex h-[520px] flex-col rounded-xl border">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="text-muted-foreground size-3.5" />
          Test your bot
        </p>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear the test conversation"
          disabled={turns.length === 0 || thinking}
          onClick={() => setTurns([])}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {turns.length === 0 ? (
          <div className="text-muted-foreground m-auto flex max-w-60 flex-col gap-2 text-center text-xs leading-relaxed">
            <p>
              Ask the agent something the way a customer would. It answers with
              the prompt and knowledge on this screen — including changes you
              have not saved.
            </p>
            <p>Nothing here is sent to anyone.</p>
          </div>
        ) : (
          turns.map((turn, index) =>
            turn.role === "user" ? (
              <p
                key={index}
                className="bg-muted ml-auto max-w-[85%] rounded-lg px-3 py-2 text-xs break-words"
              >
                {turn.content}
              </p>
            ) : (
              <div key={index} className="flex max-w-[85%] flex-col gap-1">
                <p
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs leading-relaxed break-words",
                    turn.failed
                      ? "text-destructive border-destructive/40 border border-dashed"
                      : "border",
                  )}
                >
                  {turn.content}
                </p>

                {/* The same flag the Inbox renders on a real draft. Worth
                    surfacing here because it is the model saying the thread
                    needs a person, which is a thing you are testing for. */}
                {turn.needsHuman && (
                  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Info className="size-3" />
                    Flagged for a human
                  </span>
                )}
              </div>
            ),
          )
        )}

        {thinking && (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3 animate-spin" />
            Thinking…
          </p>
        )}

        <div ref={tail} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t p-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Send a message"
          aria-label="Message to test the bot with"
          disabled={thinking}
          className="h-8"
        />
        <Button
          type="submit"
          size="icon-sm"
          aria-label="Send"
          disabled={!draft.trim() || thinking}
        >
          <Send className="size-3.5" />
        </Button>
      </form>
    </section>
  );
}

/** One side of the test transcript. */
type Turn = {
  role: "user" | "assistant";
  content: string;
  /** The model asked for a person. Shown, not acted on. */
  needsHuman?: boolean;
  /** The request failed; this is the reason, not an answer. */
  failed?: boolean;
};
