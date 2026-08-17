"use client";

import Link from "next/link";
import { PhoneOff } from "lucide-react";

import { BuyNumberDialog } from "@/components/phone/buy-number-dialog";

/**
 * What Phone System looks like for a client who has not been given a number.
 *
 * This replaced a list of the agency's numbers. Showing those was not a
 * cosmetic mistake — the page reads as "here is your phone system", and a
 * client had no way to tell that the number on it was not theirs, that texts
 * to it reached the agency's inbox, or that the buttons beside it acted on the
 * agency's account.
 *
 * Named for the state rather than the page, because that is what it is: an
 * account with no number does not have a partly-working phone system, it has
 * none. The inbox stays empty and every automation that texts has nothing to
 * text from, which is why the copy says so instead of leaving someone to
 * discover it when a lead does not get a reply.
 */
export function NoNumber({ canBuy }: { canBuy: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-16 text-center">
      <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
        <PhoneOff className="size-4" />
      </span>

      <p className="text-sm font-medium">
        There&apos;s no number registered on this account
      </p>

      <p className="text-muted-foreground max-w-sm text-sm">
        To get started with the chat and automations, buy one — until then
        there is nothing for calls and texts to arrive on, and nothing for the
        automations to send from.
      </p>

      {canBuy ? (
        <>
          <div className="pt-1">
            <BuyNumberDialog />
          </div>
          <p className="text-muted-foreground max-w-sm text-xs">
            The number arrives with a balance of $0.00. Add credit on{" "}
            <Link
              href="/billing"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Balance
            </Link>{" "}
            to switch it on — until then it will not take calls or texts.
          </p>
        </>
      ) : (
        <p className="text-muted-foreground max-w-sm text-xs">
          Adding one is done by your agency — ask them to set up billing for
          this account and buy your first number.
        </p>
      )}
    </div>
  );
}
