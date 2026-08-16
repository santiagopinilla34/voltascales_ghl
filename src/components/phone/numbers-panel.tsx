"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { A2pDialog } from "@/components/phone/a2p-dialog";
import { OwnedNumbers } from "@/components/phone/owned-numbers";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/format";
import { missingA2pFields, type A2pProfile } from "@/lib/phone/a2p";
import type { OwnedNumber } from "@/lib/phone/numbers";

/**
 * Owns the A2P dialog for the whole page.
 *
 * One dialog rather than one per row: it edits a single business-wide profile,
 * so a per-number instance would be several components editing the same record
 * and disagreeing about its state. The row that opened it is passed through
 * only so the copy can name the number you were looking at.
 */
export function NumbersPanel({
  numbers,
  profile,
  started,
  submittedAt,
}: {
  numbers: OwnedNumber[];
  profile: A2pProfile;
  /** Whether a draft has actually been saved — not guessed from field counts. */
  started: boolean;
  submittedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [forNumber, setForNumber] = useState<string | null>(null);

  const missing = missingA2pFields(profile);

  return (
    <>
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Your numbers</h2>
        <OwnedNumbers
          numbers={numbers}
          onStartA2p={(entry) => {
            setForNumber(formatPhone(entry.phoneNumber));
            setOpen(true);
          }}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Messaging compliance
          </h2>
          <p className="text-muted-foreground text-xs">
            US carriers reject application-to-person texts from unregistered
            numbers. This is done once per business, not per number.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ShieldCheck className="text-muted-foreground size-4 shrink-0" />
            <h3 className="min-w-0 flex-1 text-sm font-medium">
              A2P 10DLC business profile
            </h3>
            <span className="text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[10px]">
              {submittedAt
                ? "Submitted"
                : started
                  ? missing.length === 0
                    ? "Draft · complete"
                    : `Draft · ${missing.length} left`
                  : "Not started"}
            </span>
          </div>

          <p className="text-muted-foreground text-xs">
            {started
              ? "Your answers are saved. They will pre-fill Twilio's registration form when submitting is wired up."
              : "Fill this in now and it will be ready when registration is switched on. Nothing is sent to Twilio yet."}
          </p>

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setForNumber(null);
                setOpen(true);
              }}
            >
              {started ? "Continue the form" : "Start the form"}
            </Button>
          </div>
        </div>
      </section>

      {/* Keyed on the saved profile so reopening after a save shows the saved
          values rather than the state the dialog was mounted with. */}
      <A2pDialog
        key={JSON.stringify(profile)}
        open={open}
        onOpenChange={setOpen}
        initial={profile}
        forNumber={forNumber}
      />
    </>
  );
}
