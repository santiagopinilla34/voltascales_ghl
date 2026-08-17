/**
 * The shapes Resend's domain API speaks in.
 *
 * Split out of `domains.ts` because that module is `server-only` and these are
 * needed in the browser — the record list, the status badge and the add form
 * are all client components. Types alone would erase at compile time, but the
 * status labels below are real runtime values, and importing them from a
 * server-only module is the kind of thing that works until someone adds one
 * more import and the build breaks a long way from the cause.
 */

/**
 * Mirrors Resend's documented domain statuses.
 *
 * All seven, including the two easy to forget: `temporary_failure` is what a
 * previously-verified domain becomes when a record stops resolving, and it
 * recovers on its own if the record comes back within 72 hours. Treating it as
 * a hard failure would have the page shout about an outage that is often a DNS
 * provider having a bad ten minutes.
 */
export type ResendDomainStatus =
  | "not_started"
  | "pending"
  | "verified"
  | "partially_verified"
  | "partially_failed"
  | "failed"
  | "temporary_failure";

/**
 * The four regions Resend will send from.
 *
 * Fixed at `us-east-1` — see `SENDING_REGION` in `domains.ts`. The union is
 * still spelled out because the value cannot be changed after a domain is
 * created, and anyone reconsidering it should see the alternatives without
 * going back to the docs.
 */
export type ResendRegion =
  | "us-east-1"
  | "eu-west-1"
  | "sa-east-1"
  | "ap-northeast-1";

/**
 * One DNS record to publish.
 *
 * `status` is typed loosely rather than as `ResendDomainStatus`: per-record
 * statuses are a narrower set in practice, but they are not separately
 * documented, and a value we have not seen before should render as itself
 * rather than crash a `switch`.
 */
export type ResendDnsRecord = {
  /** "SPF" | "DKIM" | "Tracking" — what the record is for, not its DNS type. */
  record: string;
  name: string;
  type: string;
  value: string;
  ttl: string;
  status: string;
  /** MX only. */
  priority?: number;
};

export type ResendDomain = {
  id: string;
  name: string;
  status: ResendDomainStatus;
  created_at: string;
  region: string;
  records: ResendDnsRecord[];
  open_tracking?: boolean;
  click_tracking?: boolean;
  tracking_subdomain?: string | null;
  capabilities?: { sending?: string; receiving?: string };
};

/**
 * How each status reads on screen, and what it means.
 *
 * The descriptions matter more than the labels. Four of these seven statuses
 * are ones an operator will never have seen before, and "Partially verified"
 * without an explanation is a worse message than no status at all — it says
 * something is wrong without saying whether to act.
 */
export const DOMAIN_STATUS: Record<
  ResendDomainStatus,
  { label: string; detail: string; tone: "good" | "waiting" | "bad" }
> = {
  not_started: {
    label: "Not started",
    detail: "Added, but nothing has been checked yet. Publish the records below, then check.",
    tone: "waiting",
  },
  pending: {
    label: "Checking",
    detail:
      "Resend is looking for the records. DNS changes usually appear within minutes but can take hours — check again rather than waiting on this page.",
    tone: "waiting",
  },
  verified: {
    label: "Verified",
    detail: "Mail from this domain authenticates. It can be used for sending.",
    tone: "good",
  },
  partially_verified: {
    label: "Partly verified",
    detail:
      "Some records are in place and some aren't yet. Check which rows below still say Waiting.",
    tone: "waiting",
  },
  partially_failed: {
    label: "Partly failed",
    detail:
      "Verified, but one feature didn't come up. Sending may still work — check the rows below.",
    tone: "waiting",
  },
  failed: {
    label: "Failed",
    detail:
      "Resend couldn't find the records within 72 hours. Check them against your DNS provider and try again.",
    tone: "bad",
  },
  temporary_failure: {
    label: "Record missing",
    detail:
      "This domain was verified and a record has stopped resolving. Resend keeps re-checking for 72 hours — if the record comes back it returns to Verified on its own.",
    tone: "bad",
  },
};

/** Falls back rather than throwing: an unknown status should still render. */
export function describeStatus(status: string) {
  return (
    DOMAIN_STATUS[status as ResendDomainStatus] ?? {
      label: status,
      detail: "Resend reported a status this page doesn't recognise.",
      tone: "waiting" as const,
    }
  );
}
