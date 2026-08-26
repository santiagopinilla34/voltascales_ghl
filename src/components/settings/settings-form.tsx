"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Briefcase, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveSettings } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { BookingPreview } from "@/lib/booking/preview";
import { formatPhone } from "@/lib/format";
import type { Settings } from "@/types/database";

/** "90 minutes" is harder to picture than "1h 30m" once it passes an hour. */
function describeMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0)
    return "an invalid amount of time";
  if (minutes < 60) return `${minutes} minutes`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hoursLabel = `${hours} hour${hours === 1 ? "" : "s"}`;

  return rest === 0 ? hoursLabel : `${hoursLabel} ${rest} min`;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
      <Info className="mt-0.5 size-3 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function SettingsForm({
  settings,
  environmentForwardTo,
  bookingPreview,
}: {
  settings: Settings;
  /** What the voice webhook reads today, so the fallback is visible. */
  environmentForwardTo: string | null;
  /**
   * The confirmation as the rule will actually send it, rendered server-side.
   * Null when the rule is missing or unreadable — which also means nothing
   * will be sent, so the preview says that rather than showing sample text.
   */
  bookingPreview: BookingPreview | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [forwardTo, setForwardTo] = useState(settings.forward_to_number ?? "");
  // String, not number: an empty field is a real intermediate state while
  // typing, and a number-typed state would snap it to 0 mid-edit.
  const [minNotice, setMinNotice] = useState(
    String(settings.booking_min_notice_minutes),
  );
  const [notifyNumber, setNotifyNumber] = useState(
    settings.booking_notify_number ?? "",
  );
  const [meetingLink, setMeetingLink] = useState(
    settings.booking_meeting_link ?? "",
  );
  const [hostName, setHostName] = useState(settings.booking_host_name ?? "");

  const dirty =
    forwardTo !== (settings.forward_to_number ?? "") ||
    minNotice !== String(settings.booking_min_notice_minutes) ||
    notifyNumber !== (settings.booking_notify_number ?? "") ||
    meetingLink !== (settings.booking_meeting_link ?? "") ||
    hostName !== (settings.booking_host_name ?? "");

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await saveSettings({
        forward_to_number: forwardTo,
        booking_min_notice_minutes: Number(minNotice),
        booking_notify_number: notifyNumber,
        booking_meeting_link: meetingLink,
        booking_host_name: hostName,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Reflect the normalised number back, so the field shows what was
      // actually stored rather than what was typed.
      setForwardTo(result.value.forwardToNumber ?? "");
      setNotifyNumber(result.value.bookingNotifyNumber ?? "");
      toast.success("Settings saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6 pb-4">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Notifications
          </h2>
          <p className="text-muted-foreground text-xs">
            Where to reach you about new leads.
          </p>
        </div>

        {/* The notification email used to be a field here, alongside a
            business email on My Business that meant the same thing. This
            points at where it went rather than leaving someone hunting for a
            field they remember filling in. */}
        <Link
          href="/business"
          className="hover:bg-accent/50 flex min-w-0 items-center gap-2 rounded-md border px-3 py-2.5 text-xs transition-colors"
        >
          <Briefcase className="text-muted-foreground size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">
              Alerts go to your business email
            </span>{" "}
            <span className="text-muted-foreground">
              — the <code>notify_me</code> action, AI hand-offs and new-booking
              alerts. Set it on My Business.
            </span>
          </span>
        </Link>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Booking</h2>
          <p className="text-muted-foreground text-xs">
            How the public booking page offers your time. The hours themselves
            are below.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="min-notice">Minimum notice (minutes)</Label>
          <Input
            id="min-notice"
            type="number"
            inputMode="numeric"
            min={0}
            step={15}
            value={minNotice}
            onChange={(event) => setMinNotice(event.target.value)}
            disabled={pending}
            className="w-40"
          />
          <Note>
            {Number(minNotice) === 0
              ? "Zero — someone can book a slot that starts in a minute."
              : `A slot stops being bookable ${describeMinutes(Number(minNotice))} before it starts.`}
          </Note>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="meeting-link">Meeting link</Label>
          <Input
            id="meeting-link"
            type="url"
            inputMode="url"
            value={meetingLink}
            onChange={(event) => setMeetingLink(event.target.value)}
            placeholder="https://zoom.us/j/1234567890"
            disabled={pending}
          />
          <Note>
            {meetingLink.trim()
              ? "Sent in the confirmation and both reminders. Change it here and every future message uses the new one, including for meetings already booked."
              : "Empty, so the confirmation tells them you'll call the number they gave you instead."}
          </Note>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="host-name">Your first name</Label>
          <Input
            id="host-name"
            value={hostName}
            onChange={(event) => setHostName(event.target.value)}
            placeholder="Aleck"
            autoComplete="given-name"
            disabled={pending}
          />
          <Note>
            Signs the messages to clients. A text from a person gets replies;
            one from a company reads like an ad.
          </Note>
        </div>

        {/* Rendered from the rule that will actually send, not from a copy of
            its wording. The wording is editable now, so a preview built any
            other way starts lying the first time somebody edits it — which is
            the exact problem this preview had before these messages moved out
            of code.

            Both are shown because they are deliberately different: the text
            carries the join link and survives on a phone until the call, the
            email states the fact and offers one action. Seeing only one would
            hide the half you did not change. */}
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-medium">
              What they get when they book
            </span>
            {bookingPreview && (
              <Link
                href={`/automations/${bookingPreview.automationId}`}
                className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-2"
              >
                Edit the wording
              </Link>
            )}
          </div>

          {bookingPreview === null ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
              The booking confirmation rule is missing or can&apos;t be read, so
              nothing can be previewed — and nothing will be sent either. Check
              the Automations page.
            </p>
          ) : (
            <>
              {!bookingPreview.active && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  This rule is switched off, so clients currently get nothing
                  when they book. The wording below is what they would get.
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1">
                  <span className="text-muted-foreground text-[11px]">
                    Text
                  </span>
                  <pre className="bg-muted text-muted-foreground overflow-x-auto rounded-md px-3 py-2 font-sans text-xs whitespace-pre-wrap">
                    {bookingPreview.sms ?? "No text is sent to the client."}
                  </pre>
                </div>

                <div className="grid gap-1">
                  <span className="text-muted-foreground text-[11px]">
                    Email
                  </span>
                  <pre className="bg-muted text-muted-foreground overflow-x-auto rounded-md px-3 py-2 font-sans text-xs whitespace-pre-wrap">
                    {bookingPreview.email
                      ? `Subject: ${bookingPreview.email.subject}\n\n${bookingPreview.email.text}`
                      : "No email is sent to the client."}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="booking-notify">Text me at</Label>
          <Input
            id="booking-notify"
            type="tel"
            value={notifyNumber}
            onChange={(event) => setNotifyNumber(event.target.value)}
            placeholder="(514) 555-0134"
            disabled={pending}
          />
          <Note>
            {notifyNumber.trim() ? (
              <>
                Texted the moment someone books or cancels, on top of the email
                above. One extra SMS per booking on your Twilio bill.
              </>
            ) : (
              <>
                Empty, so booking alerts are email-only. A booking can land an
                hour before the meeting — a text gets there in time.
              </>
            )}
          </Note>
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Call forwarding
          </h2>
          <p className="text-muted-foreground text-xs">
            The real phone inbound calls are forwarded to.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="forward-to">Forward calls to</Label>
          <Input
            id="forward-to"
            value={forwardTo}
            onChange={(event) => setForwardTo(event.target.value)}
            placeholder={
              environmentForwardTo
                ? formatPhone(environmentForwardTo)
                : "(514) 581-8570"
            }
            disabled={pending}
          />
          <Note>
            {forwardTo.trim()
              ? "Inbound calls are forwarded here, taking effect on the next call — no redeploy needed."
              : "Empty, so calls fall back to the environment."}{" "}
            {environmentForwardTo ? (
              <>
                <code>TWILIO_FORWARD_TO_NUMBER</code> is{" "}
                <strong className="tabular-nums">
                  {formatPhone(environmentForwardTo)}
                </strong>
                {forwardTo.trim() ? " and is unused while this is set." : "."}
              </>
            ) : (
              <>
                <code>TWILIO_FORWARD_TO_NUMBER</code> is not set, so leaving
                this empty means calls cannot be forwarded at all.
              </>
            )}
          </Note>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <div className="bg-background sticky bottom-0 flex items-center gap-2 border-t py-3">
        <Button type="submit" disabled={!dirty || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save settings
        </Button>
        {dirty && !pending && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setForwardTo(settings.forward_to_number ?? "");
              setMinNotice(String(settings.booking_min_notice_minutes));
              setNotifyNumber(settings.booking_notify_number ?? "");
              setMeetingLink(settings.booking_meeting_link ?? "");
              setHostName(settings.booking_host_name ?? "");
              setError(null);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
