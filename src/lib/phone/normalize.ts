/**
 * Coerces a phone number to E.164, the format Twilio sends and
 * `contacts.phone` is keyed on.
 *
 * Lived in `src/lib/contacts.ts` until the vCard importer needed it. That file
 * is `server-only` and the importer parses the file in the browser, so this
 * moved to a module with no server dependency rather than being duplicated —
 * two normalisers that disagree is two contacts for one person.
 *
 * Needed wherever a number arrives as a human typed it: the form webhook, the
 * add-contact dialog, the settings fields, the vCard importer. Twilio's own
 * payloads are already E.164.
 *
 * Bare 10- and 11-digit numbers are assumed to be North American, matching the
 * app's own number. Anything else must arrive with an explicit country code, or
 * it's rejected rather than guessed at — a wrong guess texts a stranger.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (hasPlus) {
    // E.164 allows up to 15 digits, and needs at least a country code plus a
    // subscriber number.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}
