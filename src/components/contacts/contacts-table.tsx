"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Bot,
  ChevronLeft,
  ChevronRight,
  Copy,
  ListFilter,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Rows2,
  Rows3,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { deleteContact } from "@/app/(app)/contacts/actions";
import type { ContactWithActivity } from "@/lib/contacts";
import { ContactAvatar } from "@/components/contacts/contact-avatar";
import {
  STATUS_OPTIONS,
  StatusBadge,
  type ContactStatusKey,
} from "@/components/contacts/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  contactLabel,
  formatFullTimestamp,
  formatListTimestamp,
  formatPhone,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The Contacts table, and the controls that decide what is in it.
 *
 * Search, filter, sort and paging all happen here in the browser rather than
 * on the server. That is a deliberate call about *this* list and not a general
 * rule: `listContactsWithActivity` already returns every contact in the
 * account in one round trip because the stat cards above need the whole set to
 * count anything. Given the rows are already here, pushing a query string
 * through the URL and back through Postgres to narrow them would add a network
 * round trip per keystroke and change nothing on screen.
 *
 * The day that query grows a `LIMIT` — and it will, somewhere north of a few
 * thousand contacts — this is the component that has to move server-side, and
 * the stat cards have to become their own aggregate query at the same time.
 * Neither half works with the other half left behind.
 */

/**
 * Typed by hand to arm the delete, and compared exactly — lowercase "delete"
 * does not pass.
 *
 * The point is not that it is hard to type. It is that deleting a contact is
 * the one action here with no undo behind it, and a dialog whose confirm
 * button is a single click away from the menu item that opened it is one
 * mis-aimed click from taking a customer's whole history. Making the hand do
 * something deliberate is what separates the two.
 */
const DELETE_PHRASE = "DELETE";

/** Rows per page. Above this the table is taller than any laptop window. */
const PAGE_SIZE = 25;

/** How many page numbers the pager shows at once, arrows aside. */
const PAGE_WINDOW = 5;

type SortKey = "activity" | "name" | "created";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "activity", label: "Last activity" },
  { value: "name", label: "Name" },
  { value: "created", label: "Date added" },
];

/** Everything the search box looks at, lowercased once per contact. */
function haystack(contact: ContactWithActivity): string {
  return [
    contact.name,
    contact.phone,
    formatPhone(contact.phone),
    contact.email,
    contact.business_name,
    ...contact.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function ContactsTable({
  contacts,
}: {
  contacts: ContactWithActivity[];
}) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<ContactStatusKey[]>([]);
  const [sort, setSort] = useState<SortKey>("activity");
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  // The contact the confirmation is asking about, and null when it is closed.
  // The whole row rather than an id: the dialog names who is about to go, and
  // the row it came from is gone from `contacts` by the time it closes.
  const [deleting, setDeleting] = useState<ContactWithActivity | null>(null);
  const [deletePending, startDelete] = useTransition();
  // What has been typed into the confirmation field. Cleared whenever the
  // dialog opens or closes, so a previous attempt cannot leave the word
  // sitting there and arm the button for the next contact.
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const deleteArmed = deleteConfirm === DELETE_PHRASE;

  function askToDelete(contact: ContactWithActivity) {
    setDeleteConfirm("");
    setDeleting(contact);
  }

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = contacts.filter((contact) => {
      if (
        statuses.length > 0 &&
        !statuses.includes(contact.status as ContactStatusKey)
      ) {
        return false;
      }
      return needle === "" || haystack(contact).includes(needle);
    });

    // Sorted into a copy: `contacts` is the server's array and the page above
    // renders the stat cards from it.
    return [...filtered].sort((a, b) => {
      if (sort === "name") {
        return contactLabel(a).localeCompare(contactLabel(b), undefined, {
          sensitivity: "base",
          numeric: true,
        });
      }
      if (sort === "created") {
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      }
      return Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt);
    });
  }, [contacts, query, statuses, sort]);

  // Clamped rather than reset: typing into the search box while on page three
  // should land you on the last page of the new result, not throw away the
  // page you were reading if it still exists.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  // At most five numbers, centred on where you are. One button per page is
  // fine at four pages and unusable at forty — it outgrows a phone's footer
  // somewhere around page six and a desktop's not long after.
  const pageWindow = (() => {
    const span = Math.min(PAGE_WINDOW, pageCount);
    const first = Math.min(
      Math.max(0, current - Math.floor(span / 2)),
      pageCount - span,
    );
    return Array.from({ length: span }, (_, offset) => first + offset);
  })();

  const visibleSelected = visible.filter((contact) => selected.has(contact.id));
  const allVisibleSelected =
    visible.length > 0 && visibleSelected.length === visible.length;

  function toggleRow(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((previous) => {
      const next = new Set(previous);
      // Select-all applies to the page you can see, not to the whole result —
      // a checkbox that silently picks up rows two pages away is how people
      // act on rows they never looked at.
      for (const contact of visible) {
        if (allVisibleSelected) next.delete(contact.id);
        else next.add(contact.id);
      }
      return next;
    });
  }

  function confirmDelete() {
    // Checked here and not only on the button, because Enter in the field
    // reaches this too.
    if (!deleting || !deleteArmed || deletePending) return;

    const label = contactLabel(deleting);

    startDelete(async () => {
      const result = await deleteContact(deleting.id);

      if (!result.ok) {
        // The dialog stays open: the row is still there, and closing it would
        // read as though the delete had worked.
        toast.error("Could not delete the contact", {
          description: result.error,
        });
        return;
      }

      // Dropped from the selection too, or the footer would go on counting a
      // row that no longer exists.
      setSelected((previous) => {
        if (!previous.has(deleting.id)) return previous;
        const next = new Set(previous);
        next.delete(deleting.id);
        return next;
      });

      setDeleting(null);
      toast.success(`Deleted ${label}`);
      router.refresh();
    });
  }

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied`);
    } catch {
      // Denied permission, or an insecure origin. Better to say so than to
      // leave the menu closing as though it had worked.
      toast.error(`Couldn't copy the ${what.toLowerCase()}`);
    }
  }

  if (contacts.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        No contacts yet. They appear here as soon as someone texts or calls the
        business number — or add one by hand.
      </div>
    );
  }

  const cellPadding = compact ? "py-1.5" : "py-3";

  return (
    <div className="bg-card/40 overflow-hidden rounded-xl border">
      {/* ---- Toolbar ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <div className="relative w-full min-w-0 sm:w-72">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Search contacts…"
            aria-label="Search contacts"
            className="h-9 pl-9"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="lg">
              <ListFilter className="size-4" />
              Filter
              {statuses.length > 0 && (
                <span className="bg-primary/15 text-primary ml-0.5 rounded px-1.5 text-xs tabular-nums">
                  {statuses.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {STATUS_OPTIONS.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={statuses.includes(option.value)}
                onCheckedChange={(checked) => {
                  setStatuses((previous) =>
                    checked
                      ? [...previous, option.value]
                      : previous.filter((value) => value !== option.value),
                  );
                  setPage(0);
                }}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}

            {statuses.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setStatuses([])}>
                  Clear filters
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          <Select
            value={sort}
            onValueChange={(value) => setSort(value as SortKey)}
          >
            <SelectTrigger
              aria-label="Sort contacts"
              className="w-40 data-[size=default]:h-9"
            >
              <ArrowUpDown className="text-muted-foreground size-4" />
              {/* Given its label rather than left to mirror the chosen item:
                  Radix reads that text out of the item in the portal, which
                  isn't mounted on first paint, so the trigger rendered as a
                  pair of icons with a gap between them until you opened it. */}
              <SelectValue>
                {SORTS.find((option) => option.value === sort)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {SORTS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Row height, not a view switch. Five contacts fit either way; forty
              are the reason this is here. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-lg"
                aria-pressed={compact}
                onClick={() => setCompact((value) => !value)}
              >
                {compact ? (
                  <Rows3 className="size-4" />
                ) : (
                  <Rows2 className="size-4" />
                )}
                <span className="sr-only">
                  {compact ? "Comfortable rows" : "Compact rows"}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {compact ? "Comfortable rows" : "Compact rows"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ---- Table ------------------------------------------------------ */}
      {/* No scroll wrapper here: `Table` renders its own `overflow-x-auto`
          container, and nesting a second one round it gives the row two
          scrollers where only the inner one ever moves.

          Columns drop out as the window narrows rather than all nine being
          squeezed or pushed off the side. The order they go in is the order
          they stop earning their width — business and tags are usually empty,
          email is long and rarely the thing you are scanning for, and the
          activity counts are a detail. Name and status survive to the
          narrowest size because they are what the row is *for*, and the row
          stays tappable through to the contact, which has all of it.

          Each threshold is a step later than the column's width alone would
          suggest, and the sidebar is why: a breakpoint measures the window,
          but this table gets the window minus 256px of nav plus its gutters
          from `md` up. Set by the honest-looking numbers, every band from
          768px to 1300px overflowed — 618px of columns in a 495px box at
          820, 810 in 743 at 1100 — while the window looked roomy. The rule
          for adding a column here: subtract 256 and the gutters first, then
          pick the breakpoint. */}
      <div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {/* Selection is a pointer-and-bulk idea and there is no bulk
                  action yet, so on a phone the column is 40px spent on
                  nothing. */}
              <TableHead className="hidden w-10 pl-4 lg:table-cell">
                <Checkbox
                  checked={
                    allVisibleSelected
                      ? true
                      : visibleSelected.length > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleVisible}
                  aria-label="Select every contact on this page"
                />
              </TableHead>
              <TableHead className="pl-4 lg:pl-2">Name</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="hidden xl:table-cell">Email</TableHead>
              <TableHead className="hidden 2xl:table-cell">Business</TableHead>
              <TableHead className="hidden lg:table-cell">
                Last activity
              </TableHead>
              <TableHead className="hidden 2xl:table-cell">Tags</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10 pr-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {visible.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={9}
                  className="text-muted-foreground p-10 text-center text-sm"
                >
                  No contact matches that search.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((contact) => {
                const isSelected = selected.has(contact.id);

                return (
                  <TableRow
                    key={contact.id}
                    // The row is the click target, but a plain <tr> can't hold
                    // an <a> spanning every cell without breaking table
                    // layout. Keyboard users get the same behaviour through
                    // the row's own handlers.
                    tabIndex={0}
                    role="link"
                    data-state={isSelected ? "selected" : undefined}
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/contacts/${contact.id}`);
                      }
                    }}
                    className="focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {/* The checkbox and the row menu both sit inside a row
                        whose whole job is to navigate, so each stops the click
                        before it reaches the handler above. */}
                    <TableCell
                      className={cn(
                        "hidden pl-4 lg:table-cell",
                        cellPadding,
                      )}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(contact.id)}
                        aria-label={`Select ${contactLabel(contact)}`}
                      />
                    </TableCell>

                    {/* Capped and truncating below `lg`, which is every band
                        where the row has no give — first because the name, the
                        status and the menu are the whole of it, then because
                        the sidebar has taken 256px and left the table 464.
                        Measured, that band clears its columns by 26px, and one
                        long business name would spend all of it. 176px still
                        holds both "Aleck Pinilla" and a formatted phone number
                        beside a 36px avatar, so in practice nothing clips.

                        The cap is what makes the ellipsis possible at all: the
                        table lays out automatically, so without a max-width
                        the cell just grows and `truncate` never engages. */}
                    <TableCell
                      className={cn(
                        "max-w-44 pl-4 font-medium lg:max-w-none lg:pl-2",
                        cellPadding,
                      )}
                    >
                      <span className="flex items-center gap-2.5 sm:gap-3">
                        <ContactAvatar
                          contact={contact}
                          className={compact ? "size-7" : "size-7 sm:size-9"}
                        />
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate">
                            {contactLabel(contact)}
                          </span>
                          {contact.ai_enabled && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Bot className="text-muted-foreground size-3.5 shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                AI handling is on
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                      </span>
                    </TableCell>

                    <TableCell
                      className={cn(
                        "text-muted-foreground hidden tabular-nums sm:table-cell",
                        cellPadding,
                      )}
                    >
                      {formatPhone(contact.phone)}
                    </TableCell>

                    <TableCell
                      className={cn(
                        "text-muted-foreground hidden max-w-48 truncate xl:table-cell",
                        cellPadding,
                      )}
                    >
                      {contact.email ?? (
                        <span className="text-muted-foreground/60 text-xs">
                          —
                        </span>
                      )}
                    </TableCell>

                    <TableCell
                      className={cn(
                        "hidden max-w-40 truncate 2xl:table-cell",
                        cellPadding,
                      )}
                    >
                      {contact.business_name ?? (
                        <span className="text-muted-foreground/60 text-xs">
                          —
                        </span>
                      )}
                    </TableCell>

                    <TableCell
                      className={cn("hidden lg:table-cell", cellPadding)}
                    >
                      <span className="flex items-center gap-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <time
                              dateTime={contact.lastActivityAt}
                              className="text-xs tabular-nums"
                            >
                              {formatListTimestamp(contact.lastActivityAt)}
                            </time>
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatFullTimestamp(contact.lastActivityAt)}
                          </TooltipContent>
                        </Tooltip>
                        <span className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="size-3" />
                            {contact.messageCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="size-3" />
                            {contact.callCount}
                          </span>
                        </span>
                      </span>
                    </TableCell>

                    <TableCell
                      className={cn("hidden 2xl:table-cell", cellPadding)}
                    >
                      {contact.tags.length === 0 ? (
                        <span className="text-muted-foreground/60 text-xs">
                          —
                        </span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {contact.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="font-normal"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className={cellPadding}>
                      <StatusBadge status={contact.status} />
                    </TableCell>

                    <TableCell
                      className={cn("pr-4", cellPadding)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground"
                          >
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">
                              Actions for {contactLabel(contact)}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onSelect={() =>
                              router.push(`/contacts/${contact.id}`)
                            }
                          >
                            Open contact
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => router.push(`/inbox/${contact.id}`)}
                          >
                            Open conversation
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() =>
                              copy(formatPhone(contact.phone), "Phone number")
                            }
                          >
                            <Copy className="size-4" />
                            Copy phone
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!contact.email}
                            onSelect={() =>
                              contact.email && copy(contact.email, "Email")
                            }
                          >
                            <Copy className="size-4" />
                            Copy email
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => askToDelete(contact)}
                          >
                            <Trash2 className="size-4" />
                            Delete contact
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ---- Footer ----------------------------------------------------- */}
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs">
        <p className="tabular-nums">
          {rows.length === 0
            ? "No contacts match"
            : `Showing ${start + 1} to ${start + visible.length} of ${rows.length} contact${rows.length === 1 ? "" : "s"}`}
          {selected.size > 0 && (
            <>
              {" · "}
              <span className="text-foreground">{selected.size} selected</span>{" "}
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="hover:text-foreground underline underline-offset-2"
              >
                Clear
              </button>
            </>
          )}
        </p>

        {/* Shown on a single page too, arrows greyed out. It is one control
            fewer to notice appearing when a list crosses 25 rows, and it keeps
            the footer the same height whether or not it has anywhere to go. */}
        {rows.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft className="size-4" />
              <span className="sr-only">Previous page</span>
            </Button>

            {pageWindow.map((index) => (
              <Button
                key={index}
                variant="outline"
                size="icon-sm"
                aria-current={index === current ? "page" : undefined}
                onClick={() => setPage(index)}
                className={cn(
                  "tabular-nums",
                  index === current &&
                    "border-primary/50 text-foreground bg-primary/10",
                )}
              >
                {index + 1}
              </Button>
            ))}

            <Button
              variant="outline"
              size="icon-sm"
              disabled={current === pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight className="size-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        )}
      </div>

      {/* Deliberately not closable while the delete is in flight: the dialog
          is the only thing naming who is being removed, and there is no undo
          behind it. */}
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(next) => {
          if (!next && !deletePending) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this contact?</DialogTitle>
            <DialogDescription>
              {deleting && (
                <>
                  {contactLabel(deleting)} goes for good, along with
                  {describeHistory(deleting)}. This cannot be undone.
                  <br />
                  <br />
                  Invoices and bookings in their name are kept — they lose the
                  link to the contact rather than going with them.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="delete-confirm">
              Type {DELETE_PHRASE} to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              onKeyDown={(event) => {
                // Enter is what the hand does next after typing the word, and
                // the button is the only other thing in the dialog that can
                // take it.
                if (event.key === "Enter") {
                  event.preventDefault();
                  confirmDelete();
                }
              }}
              placeholder={DELETE_PHRASE}
              // Off on all four: a browser filling this in, or correcting the
              // case of it, would undo the whole point of asking.
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={deletePending}
              className="font-mono tracking-wide"
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleting(null)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={deletePending || !deleteArmed}
            >
              {deletePending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * "their 12 messages and 3 calls", for the confirmation to name what goes.
 *
 * Says "their conversation" rather than "0 messages and 0 calls" for someone
 * added by hand and never contacted: a count of nothing reads as a bug in the
 * sentence, and the contact is still the thing being deleted.
 */
function describeHistory(contact: ContactWithActivity): string {
  const parts: string[] = [];

  if (contact.messageCount > 0) {
    parts.push(
      `${contact.messageCount} message${contact.messageCount === 1 ? "" : "s"}`,
    );
  }
  if (contact.callCount > 0) {
    parts.push(`${contact.callCount} call${contact.callCount === 1 ? "" : "s"}`);
  }

  if (parts.length === 0) return " everything on their record";

  return ` their ${parts.join(" and ")}`;
}
