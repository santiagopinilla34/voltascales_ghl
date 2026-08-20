import { ArrowRight, Lock, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The screen an account sees before it has connected anything.
 *
 * ## Why it says so much about keys
 *
 * The objection this feature exists to remove is "you want access to my
 * payments?", and the answer — that we never hold a credential and they can cut
 * us off from their own Stripe settings in one click — is the entire reason
 * this is comfortable to agree to. Left unsaid, the client supplies their own
 * assumption, and it is usually worse than the truth.
 *
 * ## No preview numbers, ever
 *
 * Other pages in this app ship with illustrative data — preview domains,
 * preview phone numbers — and that is fine because a fake domain is obviously a
 * fake domain. A fake revenue chart is not obviously anything. It is somebody
 * else's income rendered in the place their real income will appear, and it
 * would be believed. So the unconfigured state here is a sentence, not a
 * mock-up.
 */
export function ConnectGate({
  configured,
  cancelled,
  error,
}: {
  /** False until the platform credentials exist on this install. */
  configured: boolean;
  /** They pressed Cancel on Stripe's approval screen. */
  cancelled: boolean;
  error: string | null;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-6 rounded-lg border p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold tracking-tight">
          Connect Stripe to get started
        </h2>
        <p className="text-muted-foreground max-w-xl text-sm">
          Link the Stripe account you already take payments into, and your
          payments, payouts and balance show up here — alongside the rest of
          your CRM, so you stop switching tabs to answer &ldquo;did that one go
          through?&rdquo;
        </p>
      </div>

      {cancelled && (
        <Notice tone="muted">
          Nothing was connected — you cancelled on Stripe&apos;s screen. You can
          start again whenever you like.
        </Notice>
      )}

      {/*
        `unconfigured` is suppressed here because the block further down says
        the same thing at more length. Showing both put two identical amber
        warnings on one short screen, which reads as two problems.
      */}
      {error && !(error === "unconfigured" && !configured) && (
        <Notice tone="warning">{explain(error)}</Notice>
      )}

      <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-4">
        <p className="flex items-center gap-2 text-xs font-medium">
          <Lock className="size-3.5 shrink-0" />
          No API keys, and nothing for you to copy and paste
        </p>
        <ul className="text-muted-foreground flex flex-col gap-1.5 text-xs">
          <li>
            You sign in to Stripe the way you normally do and approve the
            connection there. We never see your Stripe password.
          </li>
          <li>
            We ask for <strong>read-only</strong> access. This app can show your
            payments; it cannot move money, issue refunds, or charge anyone.
          </li>
          <li>
            No key is created or stored here. You can revoke the connection from
            your own Stripe settings at any time, without asking us.
          </li>
        </ul>
      </div>

      {configured ? (
        <div className="flex flex-col gap-2">
          {/*
            A plain link, not a form. The route needs to set a cookie and then
            redirect to a third-party origin, which a Server Action cannot do
            cleanly — see the route for why the cookie is load-bearing.
          */}
          <Button asChild className="w-fit">
            <a href="/api/payments/stripe/connect">
              Connect with Stripe
              <ArrowRight className="size-4" />
            </a>
          </Button>
          <p className="text-muted-foreground text-xs">
            Takes you to Stripe and back. About thirty seconds.
          </p>
        </div>
      ) : (
        <Notice tone="warning">
          Stripe is not set up on this install yet, so there is nothing to
          connect to. The agency needs to add its Stripe Connect credentials
          before this button does anything.
        </Notice>
      )}

      <p className="text-muted-foreground border-t pt-4 text-xs">
        PayPal is not available yet. It needs PayPal to approve us as a partner
        first, which is on the agency rather than on you.
      </p>
    </section>
  );
}

/**
 * The callback's error codes, in words.
 *
 * `state` stays vague on purpose. It means either an expired cookie or a forged
 * callback, and telling the second one apart from the first is not something to
 * help with on screen.
 */
function explain(code: string): string {
  switch (code) {
    case "unconfigured":
      return "Stripe is not set up on this install yet.";
    case "state":
      return "That connection attempt could not be verified, most likely because it took too long. Please start again.";
    case "exchange":
      return "Stripe did not complete the connection. Nothing was linked — you can try again.";
    case "store":
      return "Stripe approved the connection but it could not be saved here. Please try again.";
    case "incomplete":
      return "Stripe sent us back without an authorization. Please try again.";
    default:
      return "The connection did not complete. Please try again.";
  }
}

function Notice({
  tone,
  children,
}: {
  tone: "muted" | "warning";
  children: React.ReactNode;
}) {
  if (tone === "muted") {
    return (
      <p className="text-muted-foreground rounded-md border px-3 py-2.5 text-xs">
        {children}
      </p>
    );
  }

  return (
    <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
