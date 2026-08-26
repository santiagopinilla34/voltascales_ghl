"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
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
import { toast } from "sonner";

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
import type { ConversationBot, KnowledgeTrigger } from "@/lib/ai-agents/bots";
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
 * The test conversation, held above the tabs.
 *
 * The panel is rendered twice — once on Training, once on Goals — so its state
 * cannot live inside it. Two mounts means two `useState`s, and switching tabs
 * unmounts one and mounts the other, which threw away the transcript every
 * time. That is worst exactly when the panel is most useful: the loop this
 * screen is for is *ask, read the answer, change the goal, ask again*, and it
 * crossed a tab boundary in the middle.
 *
 * The in-flight request survives the switch too. `send` closes over these
 * setters rather than the mounted component's own, so an answer that arrives
 * after you have moved tabs still lands in the transcript instead of being
 * dropped on an unmounted component.
 */
type TestConversationState = {
  turns: Turn[];
  setTurns: Dispatch<SetStateAction<Turn[]>>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  thinking: boolean;
  setThinking: Dispatch<SetStateAction<boolean>>;
};

const TestConversation = createContext<TestConversationState | null>(null);

/**
 * Where a thread is kept between visits.
 *
 * React state gets the conversation across the tabs; it does not get it across
 * a *route*. Opening Contacts unmounts the editor and everything in it, so
 * coming back to the agent used to mean starting the conversation again — and
 * going to look something up mid-test is the ordinary thing to do, not an edge
 * case.
 *
 * `sessionStorage` rather than a provider higher up the tree: it survives a
 * reload as well as a navigation, it costs nothing on the screens that never
 * read it, and the browser throws it away when the tab closes, which is the
 * right lifetime for a scratch conversation nobody asked to keep.
 *
 * The store is read through `useSyncExternalStore`, the same way the What's New
 * bubble reads its marker: the server has no session storage, so its snapshot
 * is null and the client's is the saved thread, and React reconciles the two
 * itself rather than us restoring from an effect and flashing an empty panel
 * on the way past.
 */
const STORAGE_PREFIX = "voltascales:test-conversation:";

/** Session storage does not notify the tab that wrote it. */
const STORAGE_EVENT = "voltascales:test-conversation-changed";

/**
 * How much of a thread is kept. The route refuses more than forty turns
 * anyway, so keeping more would only be storing something unsendable.
 */
const STORED_TURNS = 40;

/** What one agent's panel is holding. */
/**
 * The transcript, and only the transcript.
 *
 * The half-typed message deliberately does not live here. It did, and storing
 * it meant a write and a synchronous store notification on every keystroke —
 * fired from inside the input's own change handler, which cost the input its
 * focus and left Enter doing nothing while the send button still worked.
 * Keeping the box in ordinary React state costs a draft that does not survive
 * a navigation, which is worth far less than a working Enter key.
 */
type StoredConversation = { turns: Turn[] };

const EMPTY: StoredConversation = { turns: [] };

/**
 * Where the thread goes when the browser refuses storage.
 *
 * Private windows and locked-down webviews can throw on both read and write,
 * and the panel losing its memory is a smaller problem than the panel losing
 * its state — without this the conversation would have nowhere to live at all.
 * Browser-only: the server never reaches these functions, because
 * `getServerSnapshot` answers before they are called.
 */
const memory = new Map<string, string>();

function storageKey(botId: string) {
  return `${STORAGE_PREFIX}${botId}`;
}

/**
 * The raw JSON, not the parsed object.
 *
 * `useSyncExternalStore` compares snapshots by identity, so this has to hand
 * back something stable — parsing here would mint a new object on every read
 * and spin React in a loop.
 */
function readRaw(botId: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(botId));
    if (raw !== null) return raw;
  } catch {
    // Fall through to the in-memory copy.
  }

  return memory.get(botId) ?? null;
}

function parse(raw: string | null): StoredConversation {
  if (!raw) return EMPTY;

  try {
    const value = JSON.parse(raw) as Partial<StoredConversation>;
    return { turns: Array.isArray(value.turns) ? value.turns : [] };
  } catch {
    // Written by an older shape, or truncated. An empty panel beats a crash.
    return EMPTY;
  }
}

function write(botId: string, value: StoredConversation) {
  const raw = JSON.stringify({ turns: value.turns.slice(-STORED_TURNS) });

  memory.set(botId, raw);

  try {
    window.sessionStorage.setItem(storageKey(botId), raw);
  } catch {
    // Quota, or storage refused. The in-memory copy above still holds it.
  }

  window.dispatchEvent(new Event(STORAGE_EVENT));
}

/**
 * Applies a change to whatever is stored *now*.
 *
 * Reads before it writes rather than working from the values captured at
 * render. Sending a message sets the turns and clears the input in the same
 * tick, and a second write built on the render's stale copy would put the
 * turns back as they were before the first.
 */
function update(
  botId: string,
  change: (current: StoredConversation) => StoredConversation,
) {
  write(botId, change(parse(readRaw(botId))));
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener(STORAGE_EVENT, onChange);
  // Another tab writing the key fires `storage` rather than our own event.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(STORAGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Wraps the editor, so both copies of the panel read the same thread — and so
 * that thread outlives the editor.
 */
export function TestConversationProvider({
  botId,
  children,
}: {
  /**
   * Whose conversation this is. Keyed per agent because a thread is only ever
   * about the bot it was aimed at; carrying one across agents would test the
   * new bot against the old one's questions.
   */
  botId: string;
  children: React.ReactNode;
}) {
  // Memoised, both of them. An inline `getSnapshot` is a new function on every
  // render, which makes React tear down and re-establish the subscription each
  // time — on a component that re-renders on every keystroke, that is a lot of
  // churn for a value that has not changed.
  const getSnapshot = useCallback(() => readRaw(botId), [botId]);
  const getServerSnapshot = useCallback(() => null, []);

  const raw = useSyncExternalStore(
    subscribeToStorage,
    getSnapshot,
    getServerSnapshot,
  );

  const stored = useMemo(() => parse(raw), [raw]);

  // Ordinary state, not the store. See StoredConversation for why the input is
  // the one thing that must not round-trip through storage on every keystroke.
  const [draft, setDraft] = useState("");

  // Not stored either, and deliberately: a request that was in flight when you
  // navigated away is not in flight any more, and a spinner nothing will ever
  // stop is worse than no spinner.
  const [thinking, setThinking] = useState(false);

  const setTurns = useCallback<Dispatch<SetStateAction<Turn[]>>>(
    (action) =>
      update(botId, (current) => ({
        turns: typeof action === "function" ? action(current.turns) : action,
      })),
    [botId],
  );

  const value = useMemo(
    () => ({
      turns: stored.turns,
      setTurns,
      draft,
      setDraft,
      thinking,
      setThinking,
    }),
    [stored, setTurns, draft, thinking],
  );

  return (
    <TestConversation.Provider value={value}>
      {children}
    </TestConversation.Provider>
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
  // Falls back to its own state when there is no provider above it, so the
  // panel stays a component you can drop anywhere rather than one that only
  // works in the one place it is currently used. The hooks run either way —
  // which set is read is the only thing that changes.
  const shared = useContext(TestConversation);
  const own = useOwnConversation();
  const { turns, setTurns, draft, setDraft, thinking, setThinking } =
    shared ?? own;

  // Scrolled on every turn, including the pending one, so a long answer does
  // not arrive below the fold of a panel you are already looking at.
  const tail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tail.current?.scrollIntoView({ block: "end" });
  }, [turns, thinking]);

  /**
   * Empties the thread, and offers it back.
   *
   * The button is one click with no confirmation, which was fine when the
   * conversation died on the next navigation anyway — it does not any more, so
   * the same click now throws away something that was being kept on purpose.
   * Undo rather than a confirm dialog: clearing a scratch conversation is a
   * thing you do often and mean almost every time, and a dialog in front of it
   * would be paid for on every clear to cover the rare mis-click.
   */
  function clear() {
    const cleared = turns;

    setTurns([]);

    toast("Conversation cleared", {
      // Longer than the default four seconds. An undo you have to notice,
      // read and reach for is not the same as a notice you only have to read,
      // and four seconds is the wrong budget for the first kind.
      duration: 10_000,
      action: {
        label: "Undo",
        // Restores only if the panel is still empty. Undo is a way back to
        // what was there, not a way to overwrite a conversation started since
        // — putting the old thread back on top of a new one would be the same
        // mistake this exists to fix.
        onClick: () =>
          setTurns((current) => (current.length === 0 ? cleared : current)),
      },
    });
  }

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
          {
            role: "assistant",
            content: payload.error ?? "That failed.",
            failed: true,
          },
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
          onClick={clear}
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

/** The standalone fallback, for a panel rendered outside the provider. */
function useOwnConversation(): TestConversationState {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  return useMemo(
    () => ({ turns, setTurns, draft, setDraft, thinking, setThinking }),
    [turns, draft, thinking],
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
