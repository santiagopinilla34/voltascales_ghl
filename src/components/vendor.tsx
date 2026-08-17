"use client";

import { createContext, useContext } from "react";

/**
 * Whether the person reading this screen is allowed to know who the vendor is.
 *
 * The agency resells phone numbers. Its clients are buying "a number" from
 * VoltaScales, not a Twilio number through a middleman, and a release
 * confirmation that says "this gives the number back to Twilio" tells them
 * exactly which account to go and open for themselves. So the vendor's name is
 * shown to the agency and replaced for everyone else.
 *
 * Not security — a determined client can read the network tab — and it is not
 * pretending to be. It is the same reason a shop does not print its
 * wholesaler's invoice on the receipt.
 *
 * Fed from `isPlatformAdmin` rather than from the organization being viewed, so
 * an agency admin working inside a client account still sees the real names.
 * They are the one who has to act on "could not reach Twilio", and "could not
 * reach the phone network" would send them looking in the wrong place.
 *
 * Defaults to hiding it. A component rendered outside the provider is more
 * likely to be a client-facing page someone forgot to wrap than an agency one,
 * and the failure that leaks is worse than the failure that is vague.
 */

const VendorContext = createContext<boolean>(false);

export function VendorProvider({
  isPlatformAdmin,
  children,
}: {
  isPlatformAdmin: boolean;
  children: React.ReactNode;
}) {
  return (
    <VendorContext.Provider value={isPlatformAdmin}>
      {children}
    </VendorContext.Provider>
  );
}

export type Vendor = {
  /** True when the real provider names may be shown. */
  named: boolean;
  /**
   * "Twilio" for the agency, "the phone network" for a client — written to
   * drop into a sentence in either case, which is why it carries its own
   * article and is lower case.
   */
  phone: string;
  /** Sentence-initial form of the above. */
  Phone: string;
};

export function useVendor(): Vendor {
  const named = useContext(VendorContext);

  return {
    named,
    phone: named ? "Twilio" : "the phone network",
    Phone: named ? "Twilio" : "The phone network",
  };
}
