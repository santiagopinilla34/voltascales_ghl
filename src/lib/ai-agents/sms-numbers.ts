import "server-only";

import { requireOrgContext } from "@/lib/orgs/context";
import { listOwnedNumbers } from "@/lib/twilio/numbers";
import { twilioScopeFor } from "@/lib/twilio/scope";

/**
 * The numbers an agent could text from.
 *
 * A trimmed shape rather than `OwnedNumber`: the picker needs the number, a
 * label and whether it is the main line. Rental price, A2P state and webhook
 * config belong to the phone screens, and passing them into a client component
 * would send a page of Twilio metadata to the browser to render one select.
 */
export type SmsNumber = {
  phoneNumber: string;
  /** Twilio's friendly name, when it is not just the number again. */
  label: string | null;
  /** The organization's main line, which is the sensible default. */
  isMain: boolean;
};

/**
 * Every SMS-capable number on the account being viewed.
 *
 * Filtered by capability rather than listing everything: a voice-only number
 * in a "send SMS from" picker is an option that cannot work, and finding that
 * out means a message that never arrives rather than an error anybody sees.
 *
 * Returns an empty list when Twilio cannot be reached or the account is not
 * provisioned yet. The editor draws the same "no numbers" state either way —
 * a picker is not the screen to explain a Twilio outage on, and Phone System
 * is where that belongs.
 */
export async function listSmsNumbers(): Promise<SmsNumber[]> {
  const context = await requireOrgContext();
  const scope = await twilioScopeFor(context.orgId);

  if (!scope.provisioned) return [];

  const owned = await listOwnedNumbers(scope.client);
  if (!owned.ok) return [];

  const main = scope.mainNumber;

  return owned.value
    .filter((number) => number.capabilities.sms)
    .map((number) => ({
      phoneNumber: number.phoneNumber,
      label: labelFor(number.friendlyName, number.phoneNumber),
      isMain: number.phoneNumber === main,
    }));
}

/**
 * A friendly name worth showing, or nothing.
 *
 * Twilio defaults a number's friendly name to the number itself, and not in
 * the format it stores it in — "(438) 817-5422" against "+14388175422". Kept
 * as a string comparison, the default sails through and the picker reads
 * "(438) 817-5422 — (438) 817-5422".
 *
 * Compared as a suffix rather than for equality, because the national format
 * drops the country code: the digits are "4388175422" and "14388175422", which
 * are not equal and are plainly the same number. Ten digits is enough to make
 * a false match a curiosity rather than a risk, and the cost of one is a name
 * not shown — not a number sent from.
 */
function labelFor(friendlyName: string, phoneNumber: string): string | null {
  const name = friendlyName?.trim();
  if (!name) return null;

  const nameDigits = name.replace(/\D/g, "");
  const numberDigits = phoneNumber.replace(/\D/g, "");

  if (!nameDigits) return name;

  const sameNumber =
    numberDigits.endsWith(nameDigits) || nameDigits.endsWith(numberDigits);

  return sameNumber ? null : name;
}
