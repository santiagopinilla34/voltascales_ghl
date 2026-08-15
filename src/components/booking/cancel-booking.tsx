"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { cancelBooking } from "@/app/book/actions";
import { Button } from "@/components/ui/button";

/**
 * The confirm-then-cancel step.
 *
 * Exists so that cancelling requires a person to press a button. A link that
 * cancelled on load would be triggered by every mail scanner and chat preview
 * that fetched the URL, and the client would never know why their meeting
 * vanished.
 */
export function CancelBooking({
  token,
  clientName,
  when,
  meetingName,
}: {
  token: string;
  clientName: string;
  when: string;
  meetingName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking(token);
      if (!result.ok) {
        setError(result.error);
        // The row may have changed under us — most likely already cancelled in
        // another tab. Re-render the page against what's actually there.
        router.refresh();
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <>
        <h1 className="text-lg font-semibold tracking-tight">Cancelled</h1>
        <p className="text-muted-foreground text-sm">
          Your {meetingName} on {when} is off the calendar, and you won&apos;t
          get any reminders for it. A confirmation is on its way.
        </p>
        <Link href="/book" className="text-sm underline underline-offset-4">
          Book another time
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight">
        Cancel your {meetingName}?
      </h1>
      <p className="text-sm">
        {clientName} — {when}.
      </p>
      <p className="text-muted-foreground text-sm">
        Cancelling frees the time for someone else and stops your reminders.
      </p>

      {error && (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="destructive"
          onClick={cancel}
          disabled={pending}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Cancel the meeting
        </Button>
        <Button asChild variant="ghost" disabled={pending}>
          <Link href="/book">Keep it</Link>
        </Button>
      </div>
    </>
  );
}
