import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Scale, TriangleAlert } from "lucide-react";

import { DomainsTabs } from "@/components/domains/domains-tabs";
import {
  PREVIEW_EMAIL_DOMAINS,
  PREVIEW_OWNED_DOMAINS,
} from "@/lib/domains/domains";

export const metadata: Metadata = { title: "Domains · VoltaScales" };

/**
 * Domains (front end).
 *
 * Buy and own domains in the app, and set one up as a sending domain for
 * email. No registrar is connected — see the module comment in
 * `src/lib/domains/domains.ts` for which one to build against and why.
 */
export default function DomainsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            Domains
          </h1>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {PREVIEW_OWNED_DOMAINS.length}
          </span>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-6 pb-4">
          <p className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              This page is the front end only. No registrar is connected yet, so
              everything on it is preview data and nothing can be bought.
            </span>
          </p>

          <DomainsTabs
            domains={PREVIEW_OWNED_DOMAINS}
            emailDomains={PREVIEW_EMAIL_DOMAINS}
          />

          {/* Deliberately not dismissible. It is a reminder about something
              that has to be settled before the first paying client, and a
              reminder you can dismiss is a reminder you will dismiss. It also
              has no state to store — the brief was a note, not a feature. */}
          <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="flex min-w-0 items-center gap-2">
              <Scale className="size-4 shrink-0" />
              <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
                Open decision: who owns the domains
              </h2>
              <span className="shrink-0 rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-medium">
                Before paying clients
              </span>
            </div>

            <p className="text-xs opacity-90">
              Not decided yet: whether a client owns their domain outright,
              registered in their own name, or holds it under this agency&apos;s
              registrar account. It needs a real answer before the first paying
              client, because it is awkward to reverse afterwards and it changes
              three separate things.
            </p>

            <ul className="flex flex-col gap-1.5 text-xs opacity-90">
              <li>
                <strong className="font-medium">Registrant transfer.</strong>{" "}
                Moving a domain into a client&apos;s own account later means a
                registrant change, and most registrars then lock the domain
                against transfer for 60 days. Deciding after the fact is what
                makes it painful.
              </li>
              <li>
                <strong className="font-medium">Reseller terms.</strong>{" "}
                Registrars set out what you may and may not do while holding
                domains on someone else&apos;s behalf. Porkbun&apos;s and
                Squarespace&apos;s differ, and whichever you sign has to permit
                the model chosen here.
              </li>
              <li>
                <strong className="font-medium">Non-payment.</strong> If a
                client stops paying, who keeps the domain? In their name, you
                cannot hold it. In yours, you are the one being asked to hand
                over the domain their business runs on.
              </li>
            </ul>

            <p className="text-xs opacity-75">
              Nothing on this page depends on the answer yet — this is a note,
              not a feature.
            </p>
          </section>

          <section className="flex flex-col gap-2 border-t pt-4">
            <h2 className="text-sm font-semibold tracking-tight">
              Which registrar this will use
            </h2>
            <p className="text-muted-foreground text-xs">
              <strong className="text-foreground">Porkbun</strong> first: a real
              self-serve REST API, no partnership to negotiate, flat renewals
              and free WHOIS privacy. You can have a key today and register
              domains from this page as soon as the backend is written.
            </p>
            <p className="text-muted-foreground text-xs">
              <strong className="text-foreground">Squarespace Domains</strong>{" "}
              second, once the paperwork is done. Its reseller API does
              everything wanted here — 360+ TLDs, real-time registration inside
              your own checkout — but it is partner-gated behind an application
              and a security review, so it is worth starting and not worth
              waiting on.
            </p>
            <p className="text-muted-foreground text-xs">
              <strong className="text-foreground">Cloudflare Registrar</strong>{" "}
              is the cheapest and has the best DNS API, but it forces its own
              nameservers and does not allow reselling to third parties. Right
              for domains you own, wrong for domains your clients own.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="https://porkbun.com/api/json/v3/documentation"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline underline-offset-2"
              >
                Porkbun API docs
                <ExternalLink className="size-3" />
              </Link>
              <Link
                href="https://reseller.squarespace.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline underline-offset-2"
              >
                Squarespace reseller program
                <ExternalLink className="size-3" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
