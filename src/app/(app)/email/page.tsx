import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, KeyRound, Mail, TriangleAlert } from "lucide-react";

import { AddDomainForm } from "@/components/email/add-domain-form";
import { DomainCard } from "@/components/email/domain-card";
import { StatusDashboard } from "@/components/email/status-dashboard";
import { getSendActivity, type SendActivity } from "@/lib/resend/activity";
import { listDomainsWithRecords, resendConfigured } from "@/lib/resend/domains";
import { resolveFromAddress, sendingDomainOf } from "@/lib/resend/sending";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Email Services · VoltaScales" };

/**
 * Email Services.
 *
 * Provisioning a sending domain, end to end, without touching an environment
 * variable. Resend is the source of truth for the domain list — see the module
 * comment in `src/lib/resend/domains.ts` — so this page reads it live on every
 * request and stores nothing but which domain is active.
 */

// The whole page is a view onto DNS state that changes underneath it, and the
// reason anyone reloads is to find out whether a record has landed yet. A
// cached answer is the one thing it must never give.
export const dynamic = "force-dynamic";

export default async function EmailServicesPage() {
  const supabase = await createClient();
  const settings = await getSettings(supabase);

  const configured = resendConfigured();
  const listed = configured ? await listDomainsWithRecords() : null;
  const domains = listed?.ok ? listed.value : [];

  const sending = resolveFromAddress(settings);
  const reportTo = settings?.business_email?.trim() || null;
  const businessName = settings?.business_name?.trim() || null;

  // The dashboard is for the domain actually being sent from, and only once
  // Resend agrees it is verified. A locally-stored selection whose domain has
  // since failed should show the failure on its card, not a green panel.
  const selected = sendingDomainOf(settings);
  const activeDomain =
    selected && domains.find((domain) => domain.id === selected.id);
  const showDashboard = Boolean(activeDomain && activeDomain.status === "verified");

  // Only fetched when there is somewhere to show it: it is one or more extra
  // round trips to Resend, and no page should pay for a panel it won't render.
  let activity: SendActivity | null = null;
  let activityError: string | null = null;

  if (showDashboard && activeDomain && selected) {
    const result = await getSendActivity({
      domainId: selected.id,
      domainName: activeDomain.name,
    });
    if (result.ok) activity = result.value;
    else activityError = result.error;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1140px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              Email Services
            </h1>
            {domains.length > 0 && (
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {domains.length}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full min-w-0 max-w-[1140px] flex-col gap-6 pb-4">
          {/* What the app is sending as right now, first thing on the page.
              The failure this fixes is silent — mail is accepted and never
              delivered — so the state has to be stated somewhere it cannot be
              missed rather than inferred from the absence of a domain. */}
          {sending.source === "shared" ? (
            <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="flex min-w-0 items-center gap-2">
                <TriangleAlert className="size-4 shrink-0" />
                <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
                  Client email isn&apos;t being delivered
                </h2>
              </div>
              <p className="text-xs opacity-90">
                No sending domain is set, so everything goes out from
                Resend&apos;s shared address{" "}
                <code className="text-[11px]">onboarding@resend.dev</code>.
                Resend accepts those sends and delivers them{" "}
                <strong className="font-medium">
                  only to the address your Resend account was registered with
                </strong>
                . Booking confirmations to clients are being accepted and thrown
                away, with nothing in the logs to say so.
              </p>
              <p className="text-xs opacity-90">
                Adding a domain below and verifying it fixes this.
              </p>
            </section>
          ) : showDashboard && activeDomain && selected ? (
            <StatusDashboard
              domain={activeDomain}
              from={selected.from}
              verifiedAt={selected.verifiedAt}
              activity={activity}
              activityError={activityError}
            />
          ) : (
            <section className="flex min-w-0 flex-col gap-1.5 rounded-lg border p-4">
              <div className="flex min-w-0 items-center gap-2">
                <Mail className="text-muted-foreground size-4 shrink-0" />
                <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
                  Sending as
                </h2>
              </div>
              <code className="text-xs break-all">{sending.from}</code>
              <p className="text-muted-foreground text-xs">
                {sending.source === "domain"
                  ? "From a domain set up on this page. Check its status below — Resend has to agree it's verified before mail authenticates."
                  : "From the NOTIFY_FROM_EMAIL environment variable. Verifying a domain here replaces it, and can be changed without a redeploy."}
              </p>
            </section>
          )}

          {/* Three distinct broken states, told apart because their fixes are
              completely different and none of them is guessable from a 401. */}
          {!configured && (
            <p className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs">
              <KeyRound className="mt-0.5 size-3.5 shrink-0" />
              <span className="text-muted-foreground">
                No Resend API key is set, so nothing on this page can run. Add{" "}
                <code>RESEND_API_KEY</code> to your environment and reload.
              </span>
            </p>
          )}

          {listed && !listed.ok && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {listed.error}
                {listed.kind === "restricted_key" && (
                  <>
                    {" "}
                    <Link
                      href="https://resend.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-2"
                    >
                      Resend API keys
                      <ExternalLink className="size-3" />
                    </Link>
                  </>
                )}
              </span>
            </p>
          )}

          <section className="flex min-w-0 flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Add a sending domain
              </h2>
              <p className="text-muted-foreground text-xs">
                A domain you own. Resend gives you a set of DNS records to
                publish at your DNS provider, and once it can see them, mail
                from this app sends as you.
              </p>
            </div>
            <AddDomainForm existing={domains.map((domain) => domain.name)} />
          </section>

          {domains.length > 0 && (
            <section className="flex min-w-0 flex-col gap-3">
              <h2 className="text-sm font-semibold tracking-tight">
                Your sending domains
              </h2>
              {domains.map((domain) => (
                <DomainCard
                  key={domain.id}
                  domain={domain}
                  reportTo={reportTo}
                  businessName={businessName}
                  active={selected?.id === domain.id ? selected.from : null}
                />
              ))}
            </section>
          )}

          {configured && listed?.ok && domains.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-12 text-center">
              <p className="text-sm font-medium">No sending domains yet</p>
              <p className="text-muted-foreground max-w-sm text-sm">
                A subdomain like{" "}
                <code className="text-xs">info.voltascales.com</code> is the
                usual choice — it keeps this separate from any mailbox you host
                on the root domain later.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
