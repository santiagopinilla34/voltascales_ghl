"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Lightbulb, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { addSendingDomain } from "@/app/(app)/email/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  domainNameError,
  looksLikeSubdomain,
  normalizeDomainName,
  returnPathHost,
  suggestSubdomain,
} from "@/lib/resend/domain-name";

/**
 * Adding a sending domain.
 *
 * The one piece of guidance this form gives is to use a subdomain, and it is
 * worth the space it takes: the choice is made once, cannot be changed without
 * deleting and re-adding the domain, and the reason it matters is invisible
 * until the day it bites. It is a suggestion rather than a rule — someone who
 * knows their DNS and wants the root domain is not wrong, they just need to
 * have seen the trade-off.
 */
export function AddDomainForm({ existing }: { existing: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const name = normalizeDomainName(draft);
  // Only once there is enough typed to be judging a whole name. Warning about
  // a root domain after the third keystroke is noise.
  const settled = name.includes(".") && domainNameError(name) === null;
  const suggestingSubdomain = settled && !looksLikeSubdomain(name);
  const duplicate = settled && existing.includes(name);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const invalid = domainNameError(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (existing.includes(name)) {
      setError(`${name} is already set up here.`);
      return;
    }

    startTransition(async () => {
      const result = await addSendingDomain({ name });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setDraft("");
      toast.success(`${result.value.name} added`, {
        description: "Publish its DNS records, then check verification.",
      });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor="sending-domain" className="sr-only">
        Domain to send from
      </Label>

      <div className="flex gap-2">
        <Input
          id="sending-domain"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          placeholder="info.voltascales.com"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={pending}
          className="min-w-0 flex-1"
          aria-invalid={error !== null}
        />
        <Button type="submit" variant="outline" disabled={pending || duplicate}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          Add domain
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}

      {duplicate && !error && (
        <p className="text-muted-foreground text-xs">
          {name} is already set up below.
        </p>
      )}

      {suggestingSubdomain && !duplicate && (
        <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-muted-foreground">
              A subdomain is usually the better choice.{" "}
              <span className="text-foreground">
                Resend puts an MX record on{" "}
                <code className="text-[11px]">{returnPathHost(name)}</code>
              </span>{" "}
              for bounce reports — on your root domain that sits alongside the
              MX records of any mailbox you host there later, which is exactly
              the kind of conflict that is painful to unpick afterwards.
            </p>
            <div>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                disabled={pending}
                onClick={() => setDraft(suggestSubdomain(name))}
              >
                Use {suggestSubdomain(name)} instead
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
