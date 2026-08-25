"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookOpen,
  Bot,
  Copy,
  Info,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { BotDialog, type BotDraft } from "@/components/ai-agents/bot-dialog";
import { BotKindDialog } from "@/components/ai-agents/bot-kind-dialog";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  BOT_CHANNEL_LABELS,
  BOT_KIND_LABELS,
  BOT_LIMIT,
  BOT_MODE_LABELS,
  availableName,
  withPrimary,
  type BotKind,
  type ConversationBot,
} from "@/lib/ai-agents/bots";
import { cn } from "@/lib/utils";

/**
 * The list of chatbots, with everything you can do to one.
 *
 * The bots live in this component's state, and that is the whole story for
 * now: there is no `chatbots` table, no action and no fetch. This is the
 * screen built ahead of its backend so the shape can be argued with before it
 * is migrated — every button does what it will do, to a list that lasts until
 * the page reloads. The note under the header says so, because a list that
 * silently forgets is worse than one that admits it.
 *
 * When the table lands, this component keeps its markup and loses its
 * `useState`: `bots` becomes a prop off a server component, and each handler
 * becomes an action plus `router.refresh()` — the same swap the knowledge base
 * list already made.
 *
 * Search is done here rather than in a query for the same reason it is there:
 * ten rows is a list, not a data set, and a round trip to filter ten strings
 * would be slower than the keystroke that asked for it.
 */

/** How many channel chips fit a row before the rest become "+3". */
const CHANNELS_SHOWN = 2;

export function BotList() {
  const [bots, setBots] = useState<ConversationBot[]>([]);
  const [query, setQuery] = useState("");

  // Creating is two steps: pick a kind, then fill the form. Two pieces of
  // state rather than one union because Back has to put the chooser up with
  // the form gone, which a single "which dialog is open" value would fumble.
  const [choosingKind, setChoosingKind] = useState(false);
  const [creatingKind, setCreatingKind] = useState<BotKind | null>(null);

  const [editing, setEditing] = useState<ConversationBot | null>(null);
  const [deleting, setDeleting] = useState<ConversationBot | null>(null);

  const atLimit = bots.length >= BOT_LIMIT;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matched = needle
      ? bots.filter((bot) =>
          `${bot.name} ${bot.description ?? ""}`.toLowerCase().includes(needle),
        )
      : bots;

    // Primary first, then most recently touched. The primary bot is the only
    // one answering anything, so it is the row you came to look at.
    return [...matched].sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [bots, query]);

  function create(draft: BotDraft) {
    if (!creatingKind) return;

    const now = new Date().toISOString();

    const bot: ConversationBot = {
      id: crypto.randomUUID(),
      name: draft.name,
      description: draft.description || null,
      kind: creatingKind,
      mode: draft.mode,
      channels: draft.channels,
      // The first bot made is primary, because a list of bots where none
      // answers anything is a list that does nothing and does not say why.
      is_primary: bots.length === 0,
      created_at: now,
      updated_at: now,
    };

    setBots((current) => [...current, bot]);
    setCreatingKind(null);
    toast.success(`Created “${bot.name}”`);
  }

  function save(draft: BotDraft) {
    if (!editing) return;

    setBots((current) =>
      current.map((bot) =>
        bot.id === editing.id
          ? {
              ...bot,
              name: draft.name,
              description: draft.description || null,
              mode: draft.mode,
              channels: draft.channels,
              updated_at: new Date().toISOString(),
            }
          : bot,
      ),
    );

    setEditing(null);
    toast.success("Bot updated");
  }

  function duplicate(bot: ConversationBot) {
    if (atLimit) {
      toast.error(`You already have the maximum of ${BOT_LIMIT} bots.`);
      return;
    }

    const now = new Date().toISOString();
    const name = availableName(
      bots.map((item) => item.name),
      bot.name,
    );

    setBots((current) => [
      ...current,
      {
        ...bot,
        id: crypto.randomUUID(),
        name,
        // A copy never inherits primary: two bots answering the same thread is
        // the one outcome duplicating must not be able to cause.
        is_primary: false,
        created_at: now,
        updated_at: now,
      },
    ]);

    toast.success(`Created “${name}”`);
  }

  function makePrimary(bot: ConversationBot) {
    setBots((current) => withPrimary(current, bot.id));
    toast.success(`“${bot.name}” now answers inbound messages`);
  }

  function confirmDelete() {
    if (!deleting) return;

    setBots((current) => {
      const left = current.filter((bot) => bot.id !== deleting.id);

      // Deleting the primary would otherwise leave every remaining bot idle
      // with nothing on screen explaining it. The oldest survivor inherits.
      if (!deleting.is_primary || left.length === 0) return left;

      const oldest = [...left].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      )[0];

      return withPrimary(left, oldest.id);
    });

    toast.success(`Deleted “${deleting.name}”`);
    setDeleting(null);
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">
            Conversation AI agents
          </h2>
          <p className="text-muted-foreground text-xs">
            The bots that read your inbox and reply. Nothing here is saved yet —
            this screen is ahead of its database.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-muted-foreground text-xs tabular-nums">
            {bots.length} of {BOT_LIMIT}
          </span>

          {/* Next to Create rather than tucked inside the bot form, because
              it is not part of making a bot — it is the other half of the
              job. A bot is a voice and a set of channels; what it is allowed
              to say lives in a knowledge base, and you move between the two
              all afternoon. */}
          <Button asChild variant="outline" size="sm">
            <Link href="/ai-agents/knowledge-base">
              <BookOpen className="size-4" />
              Manage knowledge base
            </Link>
          </Button>

          <Button
            size="sm"
            disabled={atLimit}
            onClick={() => setChoosingKind(true)}
            title={
              atLimit
                ? `You have the maximum of ${BOT_LIMIT} bots. Delete one to make room.`
                : undefined
            }
          >
            <Plus className="size-4" />
            Create bot
          </Button>
        </div>
      </div>

      {/* Shown only once there is more than one bot. With one bot the rule has
          no consequence, and a standing notice about a rule that cannot bite
          you yet is the kind of thing people learn to scroll past. */}
      {bots.length > 1 && (
        <div className="text-muted-foreground flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs">
          <Info className="mt-px size-3.5 shrink-0" />
          <p className="leading-relaxed">
            Only the primary bot replies to inbound messages. The others keep
            their settings and stay quiet until you promote one.
          </p>
        </div>
      )}

      <div className="flex flex-col rounded-xl border">
        <div className="flex flex-wrap items-center justify-end gap-2 border-b px-3 py-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search bots"
              aria-label="Search bots"
              className="h-8 pl-8"
            />
          </div>
        </div>

        {bots.length === 0 ? (
          <Empty onCreate={() => setChoosingKind(true)} />
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground px-4 py-12 text-center text-sm">
            Nothing matches “{query}”.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Bot</TableHead>
                <TableHead className="w-32">Status</TableHead>
                {/* Channels and the timestamp are columns only while there is
                    room. On a phone they move under the name, where they read
                    as a sentence about the bot rather than a squeezed cell. */}
                <TableHead className="hidden w-56 md:table-cell">
                  Channels
                </TableHead>
                <TableHead className="hidden w-44 lg:table-cell">
                  Last updated
                </TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {shown.map((bot) => (
                <TableRow key={bot.id}>
                  <TableCell className="max-w-0">
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{bot.name}</span>
                        {bot.is_primary && (
                          <Badge variant="outline" className="shrink-0">
                            Primary
                          </Badge>
                        )}
                      </span>

                      {bot.description && (
                        <span className="text-muted-foreground truncate text-xs">
                          {bot.description}
                        </span>
                      )}

                      {/* Under the name rather than beside it: how a bot is
                          authored decides which editor opens, not whether
                          this is the row you wanted, so it does not belong in
                          the line you scan. */}
                      <span className="text-muted-foreground truncate text-xs">
                        {BOT_KIND_LABELS[bot.kind]}
                      </span>

                      <span className="text-muted-foreground truncate text-xs md:hidden">
                        {bot.channels.length === 0
                          ? "No channels"
                          : bot.channels
                              .map((channel) => BOT_CHANNEL_LABELS[channel])
                              .join(", ")}
                      </span>

                      <span className="text-muted-foreground truncate text-xs lg:hidden">
                        Updated {formatFullTimestamp(bot.updated_at)}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant={bot.mode === "paused" ? "ghost" : "secondary"}
                      className={cn(
                        bot.mode === "paused" && "text-muted-foreground",
                      )}
                    >
                      {BOT_MODE_LABELS[bot.mode]}
                    </Badge>
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
                    <Channels bot={bot} />
                  </TableCell>

                  <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                    {formatFullTimestamp(bot.updated_at)}
                  </TableCell>

                  <TableCell>
                    <span className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${bot.name}`}
                          >
                            <MoreVertical className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>

                        {/* Wide enough that "Set as primary" stays on one
                            line; wrapped, it reads as two menu items. */}
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => setEditing(bot)}>
                            <Pencil className="size-3.5" />
                            Edit
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => duplicate(bot)}
                            disabled={atLimit}
                          >
                            <Copy className="size-3.5" />
                            Duplicate
                          </DropdownMenuItem>

                          {/* Disabled rather than hidden on the bot that
                              already holds it: a menu whose items move
                              depending on the row is a menu you have to read
                              every time. */}
                          <DropdownMenuItem
                            onClick={() => makePrimary(bot)}
                            disabled={bot.is_primary}
                          >
                            <Star className="size-3.5" />
                            Set as primary
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleting(bot)}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <BotKindDialog
        open={choosingKind}
        onOpenChange={setChoosingKind}
        onPick={(kind) => {
          setChoosingKind(false);
          setCreatingKind(kind);
        }}
      />

      {creatingKind && (
        <BotDialog
          open
          onOpenChange={(next) => !next && setCreatingKind(null)}
          onSubmit={create}
          existing={bots}
          kind={creatingKind}
          // Back rather than a second Cancel: the kind is a decision, and
          // having to close the form and press Create bot again to change it
          // is how you end up keeping the one you picked by accident.
          onBack={() => {
            setCreatingKind(null);
            setChoosingKind(true);
          }}
        />
      )}

      {/* Mounted only while open, so it starts from the row it was opened on
          rather than from whatever it held last time. */}
      {editing && (
        <BotDialog
          open
          onOpenChange={(next) => !next && setEditing(null)}
          onSubmit={save}
          existing={bots}
          bot={editing}
        />
      )}

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this bot?</DialogTitle>
            <DialogDescription>
              “{deleting?.name}” goes for good, along with its channels and how
              it was told to answer. Conversations it has already replied to
              keep their messages.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The channel chips for one row.
 *
 * Two, then a count. Six chips would set the column's width off the widest bot
 * on the account and squeeze the name, which is the one thing in the row that
 * has to be readable — the same trade the knowledge base list makes with its
 * date columns.
 */
function Channels({ bot }: { bot: ConversationBot }) {
  if (bot.channels.length === 0) {
    return <span className="text-muted-foreground text-xs">No channels</span>;
  }

  const shown = bot.channels.slice(0, CHANNELS_SHOWN);
  const rest = bot.channels.length - shown.length;

  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((channel) => (
        <Badge key={channel} variant="outline">
          {BOT_CHANNEL_LABELS[channel]}
        </Badge>
      ))}

      {rest > 0 && (
        <Badge
          variant="ghost"
          className="text-muted-foreground"
          title={bot.channels
            .slice(CHANNELS_SHOWN)
            .map((channel) => BOT_CHANNEL_LABELS[channel])
            .join(", ")}
        >
          +{rest}
        </Badge>
      )}
    </span>
  );
}

/** No bots yet. The one place on this page that says what these are for. */
function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
        <Bot className="size-4" />
      </span>

      <p className="text-sm font-medium">No bots yet</p>

      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        A bot reads the conversations arriving on the channels you give it and
        answers from a knowledge base — the questions you get every week, asked
        at eleven at night. Until there is one, every thread waits for you.
      </p>

      <div className="pt-1">
        <Button size="sm" onClick={onCreate}>
          <Plus className="size-4" />
          Create bot
        </Button>
      </div>
    </div>
  );
}
