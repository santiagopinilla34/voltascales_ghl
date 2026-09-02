"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import {
  createCalendarGroup,
  deleteCalendar,
  duplicateCalendar,
  moveCalendarToGroup,
  setCalendarActive,
} from "@/app/(app)/calendar/settings/actions";
import { NewCalendarDialog } from "@/components/booking/new-calendar-dialog";
import { ShareCalendarDialog } from "@/components/booking/share-calendar-dialog";
import { TroubleshootCalendarDialog } from "@/components/booking/troubleshoot-calendar-dialog";
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
import { Label } from "@/components/ui/label";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatFullTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  BookingCalendar,
  CalendarGroup,
  CalendarType,
} from "@/types/database";

/**
 * The bookable calendars — the things someone can pick when booking, as
 * opposed to the appointments already sitting on them.
 *
 * Rows come from `calendars` and every action here is a Server Action that
 * writes and revalidates; the filters, the sidebar selection and the open
 * dialog are the only state this component owns. It was front-end only until
 * `20260831000000_calendars.sql` gave it a table to write to.
 */

const CALENDAR_TYPES: CalendarType[] = ["Event", "Personal", "Round robin"];

/** The sidebar value meaning "calendars that are in no group". */
const UNGROUPED = "__ungrouped__";

/** Select values for "no filter" and "nobody", which cannot be empty strings. */
const ANY_OWNER = "__any__";
const NO_OWNER = "__none__";

/**
 * Which per-row dialog is open, and for which calendar.
 *
 * One piece of state for the whole table rather than a set of dialogs inside
 * every row: only one can be open at a time, and mounting three dialogs per
 * row to keep two dozen closed ones around is work nobody sees.
 */
type RowDialog = {
  kind: "share" | "troubleshoot" | "move";
  calendar: BookingCalendar;
};

/** Counts in the sidebar are zero-padded, so 3 and 12 line up in a column. */
function padCount(count: number): string {
  return String(count).padStart(2, "0");
}

export function CalendarList({
  calendars,
  groups,
  /** Where the booking links point. Passed from the server so the copied link
   *  is the deployment's own origin rather than whatever host the browser used. */
  bookingOrigin,
}: {
  calendars: BookingCalendar[];
  groups: CalendarGroup[];
  bookingOrigin: string;
}) {
  const [scope, setScope] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [type, setType] = useState<"all" | CalendarType>("all");
  const [owner, setOwner] = useState<string>(ANY_OWNER);
  const [creating, setCreating] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [dialog, setDialog] = useState<RowDialog | null>(null);
  const [pending, startTransition] = useTransition();

  const groupsById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );

  /** Every team member on a calendar, for the filter to offer. */
  const owners = useMemo(() => {
    const names = new Set<string>();
    for (const calendar of calendars) {
      for (const member of calendar.members) names.add(member);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [calendars]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return calendars.filter((calendar) => {
      if (scope === UNGROUPED && calendar.group_id) return false;
      if (scope !== "all" && scope !== UNGROUPED && calendar.group_id !== scope) {
        return false;
      }
      if (status === "active" && !calendar.active) return false;
      if (status === "inactive" && calendar.active) return false;
      if (type !== "all" && calendar.type !== type) return false;
      if (owner === NO_OWNER && calendar.members.length > 0) return false;
      if (
        owner !== ANY_OWNER &&
        owner !== NO_OWNER &&
        !calendar.members.includes(owner)
      ) {
        return false;
      }
      if (!needle) return true;
      // The handle is searchable too — it is on screen, so it should be.
      return (
        calendar.name.toLowerCase().includes(needle) ||
        calendar.slug.includes(needle)
      );
    });
  }, [calendars, owner, query, scope, status, type]);

  /** Runs one action and reports whichever way it went. */
  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(done);
      else toast.error(result.error ?? "Something went wrong");
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:gap-6">
        <GroupsSidebar
          calendars={calendars}
          groups={groups}
          scope={scope}
          onScope={setScope}
          onNewGroup={() => setCreatingGroup(true)}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={status}
              onValueChange={(next) => setStatus(next as typeof status)}
            >
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status: All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={type}
              onValueChange={(next) => setType(next as typeof type)}
            >
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Type: All</SelectItem>
                {CALENDAR_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_OWNER}>Owned by: Anyone</SelectItem>
                {owners.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
                <SelectItem value={NO_OWNER}>Unassigned</SelectItem>
              </SelectContent>
            </Select>

            {/* Search and the primary action sit at the far edge so the filters
                read as one group and the action as another. */}
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Calendar name"
                  aria-label="Search calendars"
                  className="h-7 w-48 pl-7 text-xs"
                />
              </div>

              <NewCalendarDialog
                open={creating}
                onOpenChange={setCreating}
                members={owners}
              />
            </div>
          </div>

          <div className="min-w-0 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Calendar name</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((calendar) => (
                  <TableRow key={calendar.id}>
                    <TableCell>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {calendar.name}
                        </span>
                        <CopyableSlug slug={calendar.slug} />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {calendar.group_id
                        ? (groupsById.get(calendar.group_id)?.name ?? "—")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {calendar.members.length > 0
                        ? calendar.members.join(", ")
                        : "Unassigned"}
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {calendar.duration_minutes} min
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {calendar.type}
                    </TableCell>
                    <TableCell>
                      <Badge variant={calendar.active ? "secondary" : "outline"}>
                        {calendar.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatFullTimestamp(calendar.updated_at)}
                    </TableCell>
                    <TableCell>
                      {/* The three things you do to one calendar, then
                          everything rarer behind the menu — same split as the
                          row of icons in the product this is modelled on. */}
                      <div className="flex items-center justify-end gap-1">
                        {/* A link, not a dialog: editing a calendar means its
                            details, its location, its hours and its booking
                            rules, which are a screen rather than a modal. It
                            used to point at the Availability tab, which was
                            the only one of those four that had an editor. */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              asChild
                              aria-label={`Edit calendar: ${calendar.name}`}
                            >
                              <Link href={`/calendar/settings/${calendar.id}`}>
                                <Pencil />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit calendar</TooltipContent>
                        </Tooltip>

                        <RowAction
                          label="Share calendar"
                          calendar={calendar}
                          onClick={() => setDialog({ kind: "share", calendar })}
                        >
                          <Share2 />
                        </RowAction>
                        <RowAction
                          label="Troubleshoot calendar"
                          calendar={calendar}
                          onClick={() =>
                            setDialog({ kind: "troubleshoot", calendar })
                          }
                        >
                          <Wrench />
                        </RowAction>

                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={pending}
                                  aria-label={`More options for ${calendar.name}`}
                                >
                                  <MoreVertical />
                                </Button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>More options</TooltipContent>
                          </Tooltip>
                          {/* Wide enough that "Deactivate calendar" stays on one
                              line — a wrapped menu item reads as two items. */}
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/calendar/settings?tab=availability&calendar=${calendar.id}`}
                              >
                                <SlidersHorizontal />
                                Hours and settings
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                run(
                                  () => duplicateCalendar(calendar.id),
                                  `${calendar.name} duplicated`,
                                )
                              }
                            >
                              <CopyPlus />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setDialog({ kind: "move", calendar })}
                            >
                              <ArrowRight />
                              Move to group
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                run(
                                  () =>
                                    setCalendarActive(calendar.id, !calendar.active),
                                  `${calendar.name} ${
                                    calendar.active ? "deactivated" : "activated"
                                  }`,
                                )
                              }
                            >
                              {calendar.active ? <EyeOff /> : <Eye />}
                              {calendar.active
                                ? "Deactivate calendar"
                                : "Activate calendar"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() =>
                                run(
                                  () => deleteCalendar(calendar.id),
                                  `${calendar.name} deleted`,
                                )
                              }
                            >
                              <Trash2 />
                              Delete calendar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {visible.length === 0 && (
                  <TableRow>
                    {/* Two empty states in one cell, because "you have none"
                        and "your filters match none" want different next
                        steps. */}
                    <TableCell
                      colSpan={8}
                      className="text-muted-foreground py-10 text-center"
                    >
                      {calendars.length === 0
                        ? "No calendars yet. Create one to start taking bookings."
                        : "No calendars match these filters."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-muted-foreground text-xs">
            Showing {visible.length} of {calendars.length}{" "}
            {calendars.length === 1 ? "calendar" : "calendars"}
          </p>
        </div>
      </div>

      {/* Keyed by calendar so opening the dialog for a different row starts it
          fresh rather than reusing the last row's internal state. */}
      {dialog?.kind === "share" && (
        <ShareCalendarDialog
          key={dialog.calendar.id}
          calendar={dialog.calendar}
          origin={bookingOrigin}
          open
          onOpenChange={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "troubleshoot" && (
        <TroubleshootCalendarDialog
          key={dialog.calendar.id}
          calendar={dialog.calendar}
          open
          onOpenChange={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "move" && (
        <MoveToGroupDialog
          key={dialog.calendar.id}
          calendar={dialog.calendar}
          groups={groups}
          open
          onOpenChange={() => setDialog(null)}
          onMove={(groupId, label) => {
            setDialog(null);
            run(
              () => moveCalendarToGroup(dialog.calendar.id, groupId),
              groupId
                ? `${dialog.calendar.name} moved to ${label}`
                : `${dialog.calendar.name} removed from its group`,
            );
          }}
        />
      )}

      <NewGroupDialog
        open={creatingGroup}
        onOpenChange={setCreatingGroup}
        existing={groups.map((group) => group.name)}
        onAdd={(name) => {
          setCreatingGroup(false);
          startTransition(async () => {
            const result = await createCalendarGroup(name);
            if (result.ok) {
              // Jump to what you just made — an empty group you cannot see
              // reads like the button did nothing.
              setScope(result.value.id);
              toast.success(`${name} created`);
            } else {
              toast.error(result.error);
            }
          });
        }}
      />
    </div>
  );
}

/**
 * Groups down the side, as a filter rather than a tree.
 *
 * "Not grouped" is listed alongside the real groups because it is the one
 * every calendar starts in, and it needs to be reachable.
 */
function GroupsSidebar({
  calendars,
  groups,
  scope,
  onScope,
  onNewGroup,
}: {
  calendars: BookingCalendar[];
  groups: CalendarGroup[];
  scope: string;
  onScope: (scope: string) => void;
  onNewGroup: () => void;
}) {
  const ungrouped = calendars.filter((calendar) => !calendar.group_id).length;

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 md:w-52">
      <ScopeRow
        label="All calendars"
        count={calendars.length}
        selected={scope === "all"}
        onSelect={() => onScope("all")}
        className="border"
      />

      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-muted-foreground px-2 pb-1 text-xs font-medium">
          Groups
        </span>

        {groups.map((group) => (
          <ScopeRow
            key={group.id}
            label={group.name}
            count={
              calendars.filter((calendar) => calendar.group_id === group.id).length
            }
            selected={scope === group.id}
            onSelect={() => onScope(group.id)}
          />
        ))}

        <ScopeRow
          label="Not grouped"
          count={ungrouped}
          selected={scope === UNGROUPED}
          onSelect={() => onScope(UNGROUPED)}
        />
      </div>

      <Button
        variant="secondary"
        size="sm"
        className="justify-start"
        onClick={onNewGroup}
      >
        <Plus />
        New group
      </Button>
    </aside>
  );
}

/** One selectable line in the sidebar: a name, a count, and a selected state. */
function ScopeRow({
  label,
  count,
  selected,
  onSelect,
  className,
}: {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-w-0 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
        selected
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 tabular-nums opacity-70">{padCount(count)}</span>
    </button>
  );
}

/** One of the icon buttons in the Actions cell, with the tooltip that names it. */
function RowAction({
  label,
  calendar,
  onClick,
  children,
}: {
  label: string;
  calendar: BookingCalendar;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          aria-label={`${label}: ${calendar.name}`}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The handle, with a copy button — it exists to be pasted somewhere else. */
function CopyableSlug({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(slug);
        setCopied(true);
        // Long enough to notice, short enough that the row does not sit in a
        // state that no longer describes what the button will do.
        setTimeout(() => setCopied(false), 1200);
      }}
      className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs transition-colors"
      aria-label={`Copy handle ${slug}`}
    >
      <span className="truncate">Id: {slug}</span>
      {copied ? (
        <Check className="size-3 shrink-0" />
      ) : (
        <Copy className="size-3 shrink-0" />
      )}
    </button>
  );
}

/** Naming a new, empty group from the sidebar. */
function NewGroupDialog({
  open,
  onOpenChange,
  existing,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: string[];
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");

  const trimmed = name.trim();
  const duplicate = existing.some(
    (group) => group.toLowerCase() === trimmed.toLowerCase(),
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || duplicate) return;
    onAdd(trimmed);
    setName("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reset on close rather than in an effect: a half-typed name should
        // not be waiting there the next time this opens.
        if (!next) setName("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
            <DialogDescription>
              A group is a folder for calendars that belong together.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5 py-4">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Sales team"
              autoFocus
            />
            {duplicate && (
              <p className="text-destructive text-xs">
                There is already a group called {trimmed}.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || duplicate}>
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Filing a calendar under one of the groups that exist. */
function MoveToGroupDialog({
  calendar,
  groups,
  open,
  onOpenChange,
  onMove,
}: {
  calendar: BookingCalendar;
  groups: CalendarGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (groupId: string | null, label: string) => void;
}) {
  const NONE = "__none__";
  const [choice, setChoice] = useState(calendar.group_id ?? NONE);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const group = groups.find((entry) => entry.id === choice);
    onMove(choice === NONE ? null : choice, group?.name ?? "");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Move to group</DialogTitle>
            <DialogDescription>
              Groups keep related calendars together in this list.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5 py-4">
            <Label htmlFor="move-group">Group</Label>
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger id="move-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not grouped</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {groups.length === 0 && (
              <p className="text-muted-foreground text-xs">
                No groups yet — make one with New group in the sidebar.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Move calendar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
