import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, TriangleAlert } from "lucide-react";

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
