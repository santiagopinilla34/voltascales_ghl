"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { saveReplyTo } from "@/app/(app)/email/actions";
import { AddressInput } from "@/components/email/address-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addressError, type ReplyToSource } from "@/lib/resend/addresses";

/**
 * The Reply Address card.
 *
 * Starts on the Business email rather than empty when nothing is saved. That
 * address is already on file and is almost always the right answer, so the
 * common case is reading a sentence and leaving the field alone — typing it
 * again would only add a second place to make a typo.
 *
 * The failure it prevents is invisible from inside the app: mail sends fine,
 * the client answers, and the answer lands on a sending subdomain that cannot
 * receive. Nothing bounces into anyone's view. The business simply concludes
 * that clients do not reply.
 */
export function ReplyAddressForm({
  saved,
  effective,
  source,
  businessEmail,
}: {
  /** What is stored, empty when falling back. */
  saved: string[];
  /** What actually goes out on the header today. */
  effective: string[];
  source: ReplyToSource;
  /** The Business page's address, offered as the fallback. */
  businessEmail: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addresses, setAddresses] = useState<string[]>(
    saved.length ? saved : effective,
  );
  const [error, setError] = useState<string | null>(null);

  // Compared against the effective addresses, not the stored ones: with nothing
  // saved and the Business email prefilled, the field already shows what mail
  // carries, and offering to "save" that is offering to change nothing.
  const unchanged =
    addresses.length === effective.length &&
    addresses.every((address, index) => address === effective[index]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await saveReplyTo({ addresses });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(
        addresses.length
          ? `Replies will go to ${addresses.join(", ")}`
          : "Reply address cleared",
        {
          description: addresses.length
            ? undefined
            : businessEmail
              ? `Falling back to ${businessEmail} from your Business details.`
              : "Nothing to fall back to — replies will go nowhere.",
        },
      );
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex min-w-0 flex-col gap-5 rounded-lg border p-4 sm:p-5"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="reply-address" className="text-xs font-medium">
          Reply Address
        </Label>
        <AddressInput
          id="reply-address"
          addresses={addresses}
          onChange={(next) => {
            setAddresses(next);
            setError(null);
          }}
          validate={addressError}
          placeholder="Reply address (press Enter after each address)"
          disabled={pending}
        />

        {/* Three states worth saying out loud, because only one of them is
            visible from the field's contents alone. */}
        {source === "none" && (
          <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              No reply address is set, so outbound mail carries none. Anyone
              replying is writing to a domain with no inbox, and their message
              is lost without a bounce.
            </span>
          </p>
        )}

        {source === "business" && (
          <p className="text-muted-foreground text-xs">
            Using <code className="text-[11px]">{effective[0]}</code> from your
            Business details. Save a different address here to override it just
            for email.
          </p>
        )}

        {source === "explicit" && (
          <p className="text-muted-foreground text-xs">
            Set here, overriding your Business details
            {businessEmail ? (
              <>
                {" "}
                (<code className="text-[11px]">{businessEmail}</code>)
              </>
            ) : null}
            . Remove every address and save to go back to it.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || unchanged}>
          {pending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}
