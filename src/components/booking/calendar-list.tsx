"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  Filter,
  LayoutGrid,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Trash2,
  Users,
  UserRound,
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
import { memberInitials } from "@/components/booking/booking-calendar";
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
      {/* The filters run the full width above the split below, rather than
          sitting in the right-hand column: they narrow what the table shows,
          and the groups down the side are one more filter on the same list. */}
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
          <ScopeCard
            count={calendars.length}
            selected={scope === "all"}
            onSelect={() => setScope("all")}
          />

          <FilterCard
            value={status}
            onValueChange={(next) => setStatus(next as typeof status)}
            ariaLabel="Filter by status"
            icon={
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  status === "inactive" ? "bg-muted-foreground" : "bg-emerald-500",
                )}
              />
            }
            hint={
              status === "all"
                ? "Active, Inactive"
                : status === "active"
                  ? "Active only"
                  : "Inactive only"
            }
          >
            <SelectItem value="all">Status: All</SelectItem>
            <SelectItem value="active">Status: Active</SelectItem>
            <SelectItem value="inactive">Status: Inactive</SelectItem>
          </FilterCard>

          <FilterCard
            value={type}
            onValueChange={(next) => setType(next as typeof type)}
            ariaLabel="Filter by type"
            icon={<Filter className="size-4 shrink-0 text-emerald-400" />}
            hint={type === "all" ? "All types" : `${type} only`}
          >
            <SelectItem value="all">Type: All</SelectItem>
            {CALENDAR_TYPES.map((option) => (
              <SelectItem key={option} value={option}>
                Type: {option}
              </SelectItem>
            ))}
          </FilterCard>

          <FilterCard
            value={owner}
            onValueChange={setOwner}
            ariaLabel="Filter by owner"
            icon={<UserRound className="size-4 shrink-0 text-emerald-400" />}
            hint={
              owner === ANY_OWNER
                ? "All members"
                : owner === NO_OWNER
                  ? "Unassigned only"
                  : "One member"
            }
          >
            <SelectItem value={ANY_OWNER}>Owned by: Anyone</SelectItem>
            {owners.map((name) => (
              <SelectItem key={name} value={name}>
                Owned by: {name}
              </SelectItem>
            ))}
            <SelectItem value={NO_OWNER}>Owned by: Nobody</SelectItem>
          </FilterCard>
        </div>

        {/* Search and the primary action sit at the far edge so the filters
            read as one group and the action as another. */}
        <div className="flex min-w-0 items-center gap-2 xl:ml-auto">
          <div className="relative w-full min-w-0 sm:w-60">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Calendar name"
              aria-label="Search calendars"
              className="h-10 pl-9"
            />
          </div>

          <NewCalendarDialog
            open={creating}
            onOpenChange={setCreating}
            members={owners}
            className="h-10 gap-2 bg-emerald-600 px-4 text-white hover:bg-emerald-500"
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-stretch md:gap-4">
        <GroupsSidebar
          calendars={calendars}
          groups={groups}
          scope={scope}
          onScope={setScope}
          onNewGroup={() => setCreatingGroup(true)}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="bg-card/40 min-w-0 overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                {/* The header is furniture, so it does not light up under the
                    pointer the way the rows below it do. */}
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-12 pl-4">Calendar name</TableHead>
                  <TableHead className="h-12">Group</TableHead>
                  <TableHead className="h-12">Owner</TableHead>
                  <TableHead className="h-12">Duration</TableHead>
                  <TableHead className="h-12">Type</TableHead>
                  <TableHead className="h-12">Status</TableHead>
                  <TableHead className="h-12">Date updated</TableHead>
                  <TableHead className="h-12 pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((calendar) => (
                  <TableRow key={calendar.id}>
                    <TableCell className="py-3.5 pl-4">
                      <div className="flex min-w-0 items-center gap-3">
                        {/* The same green tile the calendar wears everywhere
                            else in the app — it makes the first column scannable
                            as rows, not as a wall of text. */}
                        <span
                          aria-hidden
                          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                        >
                          <CalendarDays className="size-4" />
                        </span>

                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {calendar.name}
                          </span>
                          <CopyableSlug slug={calendar.slug} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground py-3.5 whitespace-nowrap">
                      {calendar.group_id
                        ? (groupsById.get(calendar.group_id)?.name ?? "—")
                        : "—"}
                    </TableCell>
                    <TableCell className="py-3.5 whitespace-nowrap">
                      <OwnerCell members={calendar.members} />
                    </TableCell>
                    <TableCell className="py-3.5 tabular-nums whitespace-nowrap">
                      {calendar.duration_minutes} min
                    </TableCell>
                    <TableCell className="py-3.5 whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className="text-muted-foreground rounded-md font-normal"
                      >
                        {calendar.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5">
                      {/* A lit dot rather than a filled chip: "active" is the
                          resting state of nearly every row, and a solid badge on
                          all of them shouts louder than the thing it labels. */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1.5 pl-1.5",
                          calendar.active
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "text-muted-foreground",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 rounded-full",
                            calendar.active
                              ? "bg-emerald-500 shadow-[0_0_6px_1px] shadow-emerald-500/50"
                              : "bg-muted-foreground",
                          )}
                        />
                        {calendar.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground py-3.5 whitespace-nowrap">
                      {formatFullTimestamp(calendar.updated_at)}
                    </TableCell>
                    <TableCell className="py-3.5 pr-4">
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
                      className="text-muted-foreground py-14 text-center"
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
 * The whole-list scope, as a card above the filters.
 *
 * It is the same control as a row in the groups panel — one more way to say
 * "show me these" — but it is the one you come back to, so it is the one that
 * gets a tile and a count rather than a line in a list.
 */
function ScopeCard({
  count,
  selected,
  onSelect,
}: {
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "bg-card/40 focus-visible:ring-ring/50 flex w-full min-w-0 items-center gap-3 rounded-xl border px-3.5 py-3.5 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none sm:w-57",
        // Selected is a lit edge rather than a fill: this card is the resting
        // state of the page, and a filled card here would out-shout the row
        // that is actually selected in the panel below it.
        selected ? "border-emerald-500/30" : "hover:bg-card/70",
      )}
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
      >
        <CalendarDays className="size-4" />
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">All calendars</span>
        {/* The noun for the number at the other end of the row, so the count
            reads as a sentence rather than as a bare figure. */}
        <span className="text-muted-foreground text-xs">
          {count === 1 ? "calendar" : "calendars"}
        </span>
      </span>

      <span className="ml-auto shrink-0 text-base tabular-nums">{count}</span>
    </button>
  );
}

/**
 * One of the filter cards above the table.
 *
 * A Select rather than a menu of buttons, so the keyboard and screen-reader
 * behaviour comes from Radix. The second line is this component's own: it
 * spells out what the filter is letting through, which is the part you want to
 * read back without opening it.
 *
 * ## Why the first line is `<SelectValue />` and not a string
 *
 * It was a string, and the menu opened four inches below the fold at the left
 * edge of the window. A closed Select positions its list by aligning the
 * selected item over the value node — that is what "item-aligned" means — and
 * with no value node to measure it lands wherever the arithmetic bottoms out.
 * So the label is the real value, and each item carries the prefix the trigger
 * needs to read as a sentence ("Status: Active" rather than "Active").
 */
function FilterCard({
  value,
  onValueChange,
  ariaLabel,
  icon,
  hint,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  icon: React.ReactNode;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      {/* `data-[size=default]:h-auto` rather than a bare `h-auto`: the trigger
          sets its own height through that variant, and a plain utility never
          reaches it. */}
      <SelectTrigger
        aria-label={ariaLabel}
        className="bg-card/40 hover:bg-card/70 border-border dark:bg-card/40 dark:hover:bg-card/70 h-auto w-full rounded-xl px-3.5 py-3.5 data-[size=default]:h-auto sm:w-54"
      >
        <span className="flex min-w-0 flex-col gap-0.5 text-left">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            {icon}
            <SelectValue className="truncate" />
          </span>
          <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-emerald-500/60"
            />
            <span className="truncate">{hint}</span>
          </span>
        </span>
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

/**
 * Groups down the side, as a filter rather than a tree.
 *
 * "Not grouped" is listed alongside the real groups because it is the one
 * every calendar starts in, and it needs to be reachable. The panel keeps a
 * floor under it so it reads as a column beside the table rather than as three
 * loose lines that stop wherever the last group happens to end.
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
    <aside className="w-full shrink-0 md:w-56">
      <div className="bg-card/40 flex min-h-full flex-col gap-0.5 rounded-xl border p-4 md:min-h-[34rem]">
        <div className="text-muted-foreground flex items-center gap-2 px-2 pb-2 text-sm font-medium">
          <Users className="size-4" />
          Groups
        </div>

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

        <Button
          variant="outline"
          className="mt-3 h-9 w-full"
          onClick={onNewGroup}
        >
          <Plus />
          New group
        </Button>
      </div>
    </aside>
  );
}

/** One selectable line in the panel: a name, a count, and a selected state. */
function ScopeRow({
  label,
  count,
  selected,
  onSelect,
}: {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
        selected
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <LayoutGrid aria-hidden className="size-4 shrink-0 opacity-70" />
      <span className="truncate">{label}</span>
      <span className="ml-auto shrink-0 tabular-nums opacity-70">{count}</span>
    </button>
  );
}

/**
 * Who takes this calendar's bookings.
 *
 * A disc in front of the name, and a muted one when there is nobody: the
 * column reads down as "someone / someone / nobody" before you read a word of
 * it, which is what is being asked of it most of the time.
 */
function OwnerCell({ members }: { members: string[] }) {
  const owner = members[0];
  const extra = members.length - 1;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
          owner
            ? "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300"
            : "bg-muted text-muted-foreground",
        )}
      >
        {owner ? memberInitials(owner) : <UserRound className="size-3" />}
      </span>

      <span className={cn("truncate", !owner && "text-muted-foreground")}>
        {owner ?? "Unassigned"}
      </span>

      {extra > 0 && (
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          +{extra}
        </span>
      )}
    </div>
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
