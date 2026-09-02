"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, Clock, Lightbulb, Share2, Wrench } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AvailabilitySection,
  BasicDetailsSection,
  BookingRulesSection,
  MeetingLocationSection,
} from "@/components/booking/calendar-editor-sections";
import {
  fromCalendar,
  type CalendarDraft,
} from "@/components/booking/calendar-draft";
import { FrontEndOnlyNotice } from "@/components/booking/front-end-only-notice";
import { ShareCalendarDialog } from "@/components/booking/share-calendar-dialog";
import { TroubleshootCalendarDialog } from "@/components/booking/troubleshoot-calendar-dialog";
import { cn } from "@/lib/utils";
import type {
  AvailabilityRule,
  BookingCalendar,
  CalendarGroup,
} from "@/types/database";

/**
 * Editing one calendar: everything about it, on one screen, in five sections.
 *
 * The pencil in the calendars list used to drop you on the Availability tab,
 * which was the only part of a calendar that had an editor. This is the whole
 * thing — what it is called, where the meeting happens, when it can be booked,
 * and the rules around that — with the hours as one section of it rather than
 * as the destination.
 *
 * ## Front end only, and saying so
 *
 * Nothing here writes. The draft lives in React and goes away on reload, which
 * is what the notice at the top of the page says and what Save changes repeats
 * rather than pretending otherwise. Two of these sections *do* have working
 * server actions already — the hours and the buffer are saved by the
 * Availability tab next door — and they are deliberately not wired up here
 * yet: a screen where two sections persist and three do not, with one Save
 * button over the lot, is a worse lie than a screen that saves nothing.
 *
 * The draft is seeded from the real row, so the form opens on this calendar's
 * actual name, handle, hours, length and buffer rather than on defaults.
 *
 * ## The rail
 *
 * Sections are local state, not routes. Every one of them edits the same draft,
 * and a URL per section would mean either losing the draft on each click or
 * carrying it in the query string. The upstream product this follows does the
 * same. Advanced settings is in the rail and disabled — it is a large surface
 * (forms, payments, notifications, custom code) and a chevron that opens onto
 * nothing would say less than a row that admits it is not built.
 */

const SECTIONS = [
  {
    id: "basics",
    label: "Basic details",
    tip: "Groups let you share one scheduling link for several calendars, so customers can pick which kind of appointment they want.",
  },
  {
    id: "location",
    label: "Meeting location",
    tip: "When “Ask the booker” is selected, the person booking types the location in during booking.",
  },
  {
    id: "availability",
    label: "Availability",
    tip: "To make a calendar available around the clock, set the range from 12 AM to 12 AM.",
  },
  {
    id: "rules",
    label: "Booking rules",
    tip: "Use maximum bookings per slot to control how many meetings can happen at the same time.",
  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function CalendarEditor({
  calendar,
  rules,
  groups,
  origin,
  timeZone,
}: {
  calendar: BookingCalendar;
  rules: AvailabilityRule[];
  groups: CalendarGroup[];
  /** Where the booking links point, resolved on the server from APP_BASE_URL. */
  origin: string;
  /** The app's booking time zone, as the initial value of the picker. */
  timeZone: string;
}) {
  const [section, setSection] = useState<SectionId>("basics");
  const [draft, setDraft] = useState<CalendarDraft>(() =>
    fromCalendar(calendar, rules, timeZone),
  );
  const [dialog, setDialog] = useState<"share" | "troubleshoot" | null>(null);

  function patch(changes: Partial<CalendarDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  const tip = SECTIONS.find((entry) => entry.id === section)?.tip ?? "";

  // Without the protocol, so it reads as the link somebody would paste rather
  // than as a URL bar. Falls back to a bare path when the app does not know its
  // own origin, which is the honest thing to show.
  const bookingPath = origin
    ? `${origin.replace(/^https?:\/\//, "")}/book/`
    : "/book/";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1400px] items-center gap-4">
          <Link
            href="/calendar/settings"
            className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-xs"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back to calendars list</span>
          </Link>

          {/* The name from the row, not from the draft. It is the heading for
              the thing being edited, and having it change under you as you type
              in the field below makes the page feel like it has already saved. */}
          <h1 className="mx-auto min-w-0 truncate text-sm font-semibold tracking-tight">
            Edit — {calendar.name}
          </h1>

          <div className="flex shrink-0 items-center gap-1.5">
            <HeaderAction
              label="Share calendar"
              onClick={() => setDialog("share")}
            >
              <Share2 />
            </HeaderAction>
            <HeaderAction
              label="Troubleshoot calendar"
              onClick={() => setDialog("troubleshoot")}
            >
              <Wrench />
            </HeaderAction>
            <Button
              size="sm"
              onClick={() =>
                toast("Nothing was saved", {
                  description:
                    "This editor is front end only for now — reloading the page will lose these changes.",
                })
              }
            >
              Save changes
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 sm:px-6 lg:px-10">
        {/* 240px rather than 200: at the rail's size, "Advanced settings" and
            its Soon badge wrap onto two lines in a narrower column, and a
            two-line row next to four one-line rows reads as a mistake. */}
        <div className="mx-auto grid w-full min-w-0 max-w-[1400px] items-start gap-6 py-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          {/* `text-sm` and this much padding because that is what
              `SidebarMenuButton` uses two panes to the left — the rail is the
              same kind of thing and was a size smaller, which read as a
              caption rather than as navigation. */}
          <nav className="flex min-w-0 flex-col gap-1.5 lg:sticky lg:top-4">
            {SECTIONS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSection(entry.id)}
                aria-current={section === entry.id ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                  section === entry.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {entry.label}
              </button>
            ))}

            {/* Disabled rather than absent, and disabled rather than opening an
                empty panel. Forms, payments, notifications and custom code all
                live behind this in the product it follows; none of them exist
                here, and a chevron that expands onto nothing says less than a
                row that admits it. */}
            <button
              type="button"
              disabled
              className="text-muted-foreground/70 flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-2.5 text-left text-sm"
            >
              <ChevronRight className="size-4 shrink-0" />
              <span>Advanced settings</span>
              <Badge
                variant="outline"
                className="text-muted-foreground ml-auto shrink-0"
              >
                <Clock />
                Soon
              </Badge>
            </button>

            {/* A notch below the buttons above, deliberately: it is an aside,
                and matching them would make it compete with the navigation. */}
            <div className="mt-5 flex flex-col gap-1.5 px-3">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Lightbulb className="size-4" />
                Quick tip
              </span>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {tip}
              </p>
            </div>
          </nav>

          <div className="flex min-w-0 flex-col gap-4">
            <FrontEndOnlyNotice>
              This editor keeps nothing yet. The fields are filled in from the
              real calendar, but Save changes does not write — the hours and the
              buffer are still saved from the{" "}
              <Link
                href={`/calendar/settings?tab=availability&calendar=${calendar.id}`}
                className="underline underline-offset-2"
              >
                Availability tab
              </Link>
              .
            </FrontEndOnlyNotice>

            {section === "basics" && (
              <BasicDetailsSection
                draft={draft}
                patch={patch}
                calendarId={calendar.id}
                groups={groups}
                bookingPath={bookingPath}
              />
            )}
            {section === "location" && (
              <MeetingLocationSection draft={draft} patch={patch} />
            )}
            {section === "availability" && (
              <AvailabilitySection draft={draft} patch={patch} />
            )}
            {section === "rules" && (
              <BookingRulesSection draft={draft} patch={patch} />
            )}
          </div>
        </div>
      </div>

      <ShareCalendarDialog
        calendar={calendar}
        origin={origin}
        open={dialog === "share"}
        onOpenChange={(open) => setDialog(open ? "share" : null)}
      />
      <TroubleshootCalendarDialog
        calendar={calendar}
        open={dialog === "troubleshoot"}
        onOpenChange={(open) => setDialog(open ? "troubleshoot" : null)}
      />
    </div>
  );
}

/** One of the two icon buttons in the header, with its tooltip. */
function HeaderAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
