import type { Metadata } from "next";

import { ForwardingCard } from "@/components/email/forwarding-card";
import { ReplyAddressForm } from "@/components/email/reply-address-form";
import { resolveForwarding, resolveReplyTo } from "@/lib/resend/addresses";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Reply & Forward Settings · VoltaScales",
};

/**
 * Reply & Forward Settings.
 *
 * Split out of the Email Services page, which had grown into two jobs: getting
 * a domain to authenticate, and deciding what happens to the mail once it does.
 * The first is a provisioning flow you finish once; the second is a setting you
 * come back to. They also read from different places — that page calls Resend
 * live on every request, this one touches only the settings row — so keeping
 * them apart means the cheap page stays cheap.
 *
 * Explanation on the left, controls on the right. Deliberate rather than
 * decorative: these two settings are constantly mistaken for each other, and
 * the notes are the difference between a field someone fills in correctly and
 * one they guess at. The column collapses above the controls on a narrow
 * screen, which keeps the reading order the same.
 */

// Reads a single settings row and nothing cached, so the values shown are the
// values saved. Cheap enough that there is nothing to gain by caching it.
export const dynamic = "force-dynamic";

export default async function ReplyForwardSettingsPage() {
  const supabase = await createClient();
  const settings = await getSettings(supabase);

  const replyTo = resolveReplyTo(settings);
  const forwarding = resolveForwarding(settings);
  const businessEmail = settings?.business_email?.trim() || null;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-10 pb-6">
        <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10">
          <div className="flex min-w-0 flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">
              Forwarding Address
            </h2>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Where email replies would land besides the app itself, so they
              reach your personal inbox too.
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Not available yet. Forwarding a reply means receiving it first,
              and this app only sends — every domain it registers has receiving
              disabled.
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              You most likely don&apos;t need it. The Reply Address below
              already delivers replies straight to your inbox; forwarding is
              what would <em>additionally</em> show them on the contact&apos;s
              conversation in this app.
            </p>
          </div>

          <ForwardingCard saved={forwarding} />
        </section>

        <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10">
          <div className="flex min-w-0 flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">
              Reply Address
            </h2>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Added to every message the app sends. Your sending domain has no
              inbox, so without this a client who hits Reply is writing to an
              address that cannot accept mail.
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              It needs no DNS records and no verification, and it does not have
              to be on your sending domain — authentication is checked against
              the From address, not this one. Any mailbox you actually read
              works.
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Replies arrive in that inbox rather than in this app, so they
              won&apos;t appear on the contact&apos;s conversation.
            </p>
          </div>

          <ReplyAddressForm
            saved={replyTo.source === "explicit" ? replyTo.addresses : []}
            effective={replyTo.addresses}
            source={replyTo.source}
            businessEmail={businessEmail}
          />
        </section>
      </div>
    </div>
  );
}
