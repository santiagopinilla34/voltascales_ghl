"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

import {
  deleteBot,
  saveBot,
  setPrimaryBot,
} from "@/app/(app)/ai-agents/conversation/actions";
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
  type ConversationBot,
} from "@/lib/ai-agents/bots";
import { cn } from "@/lib/utils";

/**
 * The list of chatbots, with everything you can do to one.
 *
 * The rows come from the provider in the Conversation AI layout, not from
 * this component and not from Postgres — there is no `chatbots` table yet.
 * Every button does what it will do, to a list that lasts until the page
 * reloads, and the note under the header says so: a list that silently forgets
 * is worse than one that admits it.
 *
 * Creating and editing both leave this screen for the agent editor. A bot has
 * fifteen settings now, which is a screen rather than a dialog, and the one
 * form for both is what keeps a bot from being editable into something it
 * could not have been created as.
 *
 * Search is done here rather than in a query: ten rows is a list, not a data
 * set, and a round trip to filter ten strings would be slower than the
 * keystroke that asked for it.
 */

/** How many channel chips fit a row before the rest become "+3". */
const CHANNELS_SHOWN = 2;

export function BotList({ bots }: { bots: ConversationBot[] }) {
  const router = useRouter();

  // Every mutation here is a server action followed by a refresh, so the rows
  // this renders always came from Postgres. No optimistic copy in state: the
  // list is short, the actions are fast, and a local copy is how a failed
  // delete leaves a row missing from a screen it is still present in.
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [choosingKind, setChoosingKind] = useState(false);
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

  async function duplicate(bot: ConversationBot) {
    if (atLimit) {
      toast.error(`You already have the maximum of ${BOT_LIMIT} bots.`);
      return;
    }

    const now = new Date().toISOString();
    const name = availableName(
      bots.map((item) => item.name),
      bot.name,
    );

    setBusy(true);

    const result = await saveBot({
      ...bot,
      id: crypto.randomUUID(),
      name,
      // A copy never inherits primary: two bots answering the same thread is
      // the one outcome duplicating must not be able to cause.
      is_primary: false,
      // Copied rather than shared, or editing the copy would rewrite the
      // original's settings through the same object.
      settings: { ...bot.settings },
      channels: [...bot.channels],
      // New ids for the children too. They are the primary keys of their own
      // rows, and reusing them would have the copy's insert collide with the
      // original's.
      triggers: bot.triggers.map((trigger) => ({
        ...trigger,
        id: crypto.randomUUID(),
      })),
      goals: {
        ...bot.goals,
        automations: bot.goals.automations.map((rule) => ({
          ...rule,
          id: crypto.randomUUID(),
        })),
        contact_fields: bot.goals.contact_fields.map((field) => ({
          ...field,
          id: crypto.randomUUID(),
        })),
      },
      created_at: now,
      updated_at: now,
    });

    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`Created “${name}”`);
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;

    setBusy(true);
    const result = await deleteBot(deleting.id);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`Deleted “${deleting.name}”`);
    setDeleting(null);
    router.refresh();
  }

  async function promote(bot: ConversationBot) {
    setBusy(true);
    const result = await setPrimaryBot(bot.id);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`“${bot.name}” now answers inbound messages`);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">
            Conversation AI agents
          </h2>
          <p className="text-muted-foreground text-xs">
            The bots that read your inbox and reply.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-muted-foreground text-xs tabular-nums">
            {bots.length} of {BOT_LIMIT}
          </span>

          {/* Next to Create rather than tucked inside the agent editor,
              because it is not part of making a bot — it is the other half of
              the job. A bot is a voice and a set of channels; what it is
              allowed to say lives in a knowledge base, and you move between
              the two all afternoon. */}
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
                    {/* The whole name block is the link: the description and
                        the kind under it are part of what you read to decide
                        this is the row you wanted. */}
                    <Link
                      href={`/ai-agents/conversation/${bot.id}`}
                      className="flex flex-col gap-0.5"
                    >
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium hover:underline">
                          {bot.name}
                        </span>
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
                    </Link>
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant={bot.mode === "off" ? "ghost" : "secondary"}
                      className={cn(
                        bot.mode === "off" && "text-muted-foreground",
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
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/ai-agents/conversation/${bot.id}`)
                            }
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => duplicate(bot)}
                            disabled={atLimit || busy}
                          >
                            <Copy className="size-3.5" />
                            Duplicate
                          </DropdownMenuItem>

                          {/* Disabled rather than hidden on the bot that
                              already holds it: a menu whose items move
                              depending on the row is a menu you have to read
                              every time. */}
                          <DropdownMenuItem
                            onClick={() => promote(bot)}
                            disabled={bot.is_primary || busy}
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
        // Straight into the editor rather than a create form here. A bot has
        // fifteen settings, and the screen that owns them is the one that
        // should be making it.
        onPick={(kind) => {
          setChoosingKind(false);
          router.push(`/ai-agents/conversation/new?kind=${kind}`);
        }}
      />

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
