"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Check, Clock, Copy, RotateCw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createOneTimeBookingLink } from "@/app/(app)/calendar/settings/actions";
import {
  permanentLink,
  schedulingLink,
} from "@/components/booking/booking-calendar";
import type { BookingCalendar } from "@/types/database";

/**
 * The three ways this calendar can be handed to someone: a link, a link that
 * burns after one booking, and an embed.
 *
 * All three are real. The scheduling and permanent links resolve at
 * `/book/<slug>` and `/book/id/<id>`; the one time link writes a row to
 * `calendar_one_time_links` and is spent by the first booking made through it.
 */

export function ShareCalendarDialog({
  calendar,
  origin,
  open,
  onOpenChange,
}: {
  calendar: BookingCalendar;
  /**
   * Where the links point, resolved on the server from APP_BASE_URL.
   *
   * Not `window.location.origin`: a link copied while someone is on a preview
   * deployment or a LAN address would be pasted into an ad and stop working
   * the day that host went away.
   */
  origin: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share calendar</DialogTitle>
          <DialogDescription className="sr-only">
            Copy a booking link or embed code for {calendar.name}.
          </DialogDescription>
        </DialogHeader>

        {/* The two facts that decide whether this is the link you meant to
            copy, kept above the tabs so switching tabs never hides them. */}
        <div className="text-muted-foreground flex items-center gap-4 border-b pb-3 text-xs">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {calendar.duration_minutes} min
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {calendar.type}
          </span>
          {!calendar.active && (
            <span className="text-destructive">
              Inactive — these links will not open
            </span>
          )}
        </div>

        <Tabs defaultValue="scheduling">
          <TabsList className="w-full">
            <TabsTrigger value="scheduling">Scheduling link</TabsTrigger>
            <TabsTrigger value="one-time">One time link</TabsTrigger>
            <TabsTrigger value="embed">Embed code</TabsTrigger>
          </TabsList>

          <TabsContent value="scheduling" className="flex flex-col gap-4 pt-4">
            <CopyField
              id="share-scheduling-link"
              label="Scheduling link"
              value={schedulingLink(origin, calendar.slug)}
              help="The scheduling link is determined by the handle. Change the handle and this link follows it — which also breaks whatever was already using the old one."
            />
            <CopyField
              id="share-permanent-link"
              label="Permanent link"
              value={permanentLink(origin, calendar.id)}
              help="Ideal for funnels, website redirects, or ads — the permanent link stays constant, unaffected by handle changes."
            />
          </TabsContent>

          <TabsContent value="one-time" className="flex flex-col gap-4 pt-4">
            {/* Keyed on open so closing the dialog clears the link rather
                than showing the one the last visit already sent to someone. */}
            <OneTimeLink key={String(open)} calendar={calendar} />
          </TabsContent>

          <TabsContent value="embed" className="flex flex-col gap-4 pt-4">
            <EmbedCode calendar={calendar} origin={origin} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** A read-only value that exists to be pasted elsewhere, with its copy button. */
function CopyField({
  id,
  label,
  value,
  help,
}: {
  id: string;
  label: string;
  value: string;
  help: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex min-w-0 items-center gap-2">
        {/* Read-only rather than disabled: you still want to select the text
            by hand, and a disabled field cannot be selected. */}
        <Input id={id} value={value} readOnly className="min-w-0 flex-1 text-xs" />
        <CopyButton value={value} label={label} />
      </div>
      <p className="text-muted-foreground text-xs">{help}</p>
    </div>
  );
}

function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      aria-label={`Copy ${label.toLowerCase()}`}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        // Long enough to notice, short enough that the button stops claiming
        // something that is no longer the thing it will do next.
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/**
 * A link meant to be sent to one person and used once.
 *
 * Minted on the server, because the token has to be recorded: "used once" is
 * state, and a token nobody wrote down cannot be spent. That is also why it is
 * generated on demand rather than the moment this tab opens — every press
 * writes a row, and a link created because someone glanced at the tab is a row
 * that will never be used.
 */
function OneTimeLink({ calendar }: { calendar: BookingCalendar }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await createOneTimeBookingLink(calendar.id);
      if (result.ok) {
        setLink(result.value.url);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {link ? (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              value={link}
              readOnly
              aria-label="One time link"
              className="min-w-0 flex-1 text-xs"
            />
            <CopyButton value={link} label="One time link" />
          </div>

          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto self-start p-0"
            disabled={pending}
            onClick={generate}
          >
            <RotateCw />
            Generate new link
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={pending}
          onClick={generate}
        >
          <RotateCw />
          {pending ? "Generating…" : "Generate one time link"}
        </Button>
      )}

      {error && <p className="text-destructive text-xs">{error}</p>}

      <div className="flex flex-col gap-1 pt-1">
        <span className="font-medium">One time link</span>
        <p className="text-muted-foreground text-xs">
          Share your availability with a unique link that expires after a
          booking, keeping access controlled. Each press mints a new one, so
          send a different link to each person.
        </p>
        {/* Worth saying: it is easy to read "one time link" as "private link",
            and this one is not — the calendar has a public link of its own. */}
        <p className="text-muted-foreground text-xs">
          It does not hide the calendar — the scheduling link still works for
          anyone who has it.
        </p>
      </div>
    </div>
  );
}

/** The iframe snippet, for dropping the booking widget into a page. */
function EmbedCode({
  calendar,
  origin,
}: {
  calendar: BookingCalendar;
  origin: string;
}) {
  const snippet = [
    `<iframe src="${schedulingLink(origin, calendar.slug)}"`,
    `  style="width:100%;height:760px;border:none"`,
    `  id="${calendar.slug}"></iframe>`,
  ].join("\n");

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor="share-embed-code">Embed code</Label>
      <Textarea
        id="share-embed-code"
        value={snippet}
        readOnly
        rows={4}
        className="font-mono text-xs"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Paste this where the calendar should appear. A fixed height rather
          than a resize script — there is no embed script to load, so the frame
          has to be told how tall to be.
        </p>
        <CopyButton value={snippet} label="Embed code" className="shrink-0" />
      </div>
    </div>
  );
}
