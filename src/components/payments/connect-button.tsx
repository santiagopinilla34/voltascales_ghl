"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The button that hands you over to Stripe.
 *
 * ## Why it is its own file
 *
 * The gate around it is a server component and worth keeping that way — it is
 * a page of copy with no behaviour. This is the one part of it that needs
 * state, so it is the one part that ships to the browser.
 *
 * ## Why it needs state at all
 *
 * The href is not a page in this app. It is a route that mints a CSRF state,
 * sets a cookie and then redirects to `connect.stripe.com` — two round trips
 * before anything visibly changes, and on a cold function the first one is the
 * slow one. Without this the button swallowed the click and sat there, which
 * on the screen where somebody has just decided to trust us with their
 * payments is the worst possible moment to look broken.
 *
 * There is no way back out of the pending state, and there does not need to
 * be: either the browser leaves for Stripe, or the route redirects back here
 * with `?error=` and this component is mounted fresh.
 */
export function ConnectButton() {
  const [leaving, setLeaving] = useState(false);

  return (
    <Button
      asChild
      className="w-fit"
      aria-disabled={leaving}
      onClick={() => setLeaving(true)}
    >
      {/*
        A plain link, not a form. The route needs to set a cookie and then
        redirect to a third-party origin, which a Server Action cannot do
        cleanly — see the route for why the cookie is load-bearing.
      */}
      <a href="/api/payments/stripe/connect">
        {leaving ? "Taking you to Stripe…" : "Connect with Stripe"}
        {leaving ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="size-4" aria-hidden />
        )}
      </a>
    </Button>
  );
}
