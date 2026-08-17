/**
 * Turning Resend's DNS records into something readable at a DNS provider.
 *
 * Client-safe. The records themselves come from the API untouched — nothing
 * here rewrites a value, because a DKIM key that has been "helpfully" trimmed
 * is a DKIM key that does not verify. This only adds the two things the API
 * does not carry: a sentence saying what each record is for, and a stable
 * order to read them in.
 */

/** What a record's `status` means for the operator, collapsed to three states. */
export type RecordState = "found" | "waiting" | "failed";

export function recordState(status: string): RecordState {
  switch (status) {
    case "verified":
      return "found";
    case "failed":
      return "failed";
    default:
      return "waiting";
  }
}

/**
 * One line on why a record exists.
 *
 * Keyed on Resend's `record` label plus the DNS type, because SPF arrives as
 * two records that do completely different jobs — a TXT that says who may send
 * as you, and an MX that says where bounce reports go. Labelling both "SPF"
 * and leaving it there is how the MX ends up omitted as a duplicate.
 */
export function recordPurpose(record: { record: string; type: string }): string {
  const kind = record.record.toUpperCase();

  if (kind === "DKIM") {
    return "DKIM. Signs every message so it can't be forged or altered in transit.";
  }
  if (kind === "SPF" && record.type.toUpperCase() === "MX") {
    return "Where bounces and spam complaints are reported back to.";
  }
  if (kind === "SPF") {
    return "SPF. Tells receiving servers this sender is allowed to send as you.";
  }
  if (kind === "TRACKING") {
    return "Open and click tracking. Optional — mail authenticates without it.";
  }

  return `${record.record} record, required by Resend for this domain.`;
}

/**
 * Reading order: SPF, then DKIM, then anything else.
 *
 * Not the order the API returns them in, which is not guaranteed. SPF first
 * because it is the pair most likely to collide with records already at the
 * DNS provider, so it is where a problem will show up.
 */
export function sortRecords<T extends { record: string; type: string }>(
  records: T[],
): T[] {
  const rank = (record: T) => {
    const kind = record.record.toUpperCase();
    if (kind === "SPF") return record.type.toUpperCase() === "TXT" ? 0 : 1;
    if (kind === "DKIM") return 2;
    return 3;
  };

  return [...records].sort((left, right) => rank(left) - rank(right));
}

/**
 * A DMARC record for a domain — ours, not Resend's.
 *
 * Resend does not issue a DMARC record. Its API returns SPF and DKIM and
 * nothing else; DMARC exists in its *documentation* as something you are
 * advised to publish yourself. So this is a recommendation built from that
 * documentation, and everywhere it renders it has to be visibly separated from
 * the records above it. Publishing it is optional; publishing the others is not.
 *
 * `p=none` deliberately. It asks receivers to report on failures without acting
 * on them, which is the only safe place to start: a domain that begins at
 * `p=reject` before its SPF and DKIM are confirmed working will have its
 * legitimate mail rejected, and the symptom — mail silently vanishing — is the
 * same one this whole page exists to fix.
 *
 * The `rua=` reporting address is only included when there is a real one to
 * use. A DMARC record pointing at nobody still works; one pointing at an
 * address that does not exist generates bounces at whoever does own it.
 */
export function recommendedDmarc(reportTo: string | null): {
  name: (domain: string) => string;
  type: "TXT";
  value: string;
} {
  const email = reportTo?.trim();

  return {
    name: (domain: string) => `_dmarc.${domain}`,
    type: "TXT",
    value: email
      ? `v=DMARC1; p=none; rua=mailto:${email};`
      : "v=DMARC1; p=none;",
  };
}
