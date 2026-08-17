"use server";

import { revalidatePath } from "next/cache";

import { domainNameError, normalizeDomainName } from "@/lib/resend/domain-name";
import {
  createDomain,
  deleteDomain,
  getDomain,
  verifyAndRead,
  type ResendDomain,
} from "@/lib/resend/domains";
import {
  buildFromAddress,
  clearSendingDomain,
  sendingDomainOf,
  setSendingDomain,
} from "@/lib/resend/sending";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for the Email Services page.
 *
 * Same result shape as the rest of the app's actions: a discriminated union
 * rather than a throw, so the form renders an error instead of the page
 * breaking. The Resend layer beneath already classifies its failures into
 * sentences, so most of what happens here is passing those through unchanged.
 */

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Every action changes something the page renders. */
function revalidateEmail() {
  revalidatePath("/email");
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? supabase : null;
}

/**
 * Registers a new sending domain with Resend.
 *
 * Returns the created domain including its records, because the DKIM key in
 * them exists nowhere until this call returns and the operator needs it on
 * screen immediately — there is no second chance to generate it, only a
 * re-read.
 */
export async function addSendingDomain(input: {
  name: string;
}): Promise<ActionResult<ResendDomain>> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const name = normalizeDomainName(input.name);
  const invalid = domainNameError(name);
  if (invalid) return { ok: false, error: invalid };

  const result = await createDomain({ name });

  if (!result.ok) return { ok: false, error: result.error };

  revalidateEmail();
  return { ok: true, value: result.value };
}

/**
 * Keeps `sending_verified_at` honest, in both directions.
 *
 * If this is the first observation of the *active* domain being verified, the
 * time is stamped — that is the only moment the app can truthfully record,
 * since Resend's domain object has no verification timestamp of its own. If
 * the active domain has fallen out of verified, the stamp is cleared rather
 * than left behind claiming a verification that no longer holds.
 */
async function syncVerifiedAt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  domain: ResendDomain,
): Promise<void> {
  const settings = await getSettings(supabase);
  const active = sendingDomainOf(settings);

  if (active?.id !== domain.id) return;

  if (domain.status === "verified") {
    // Only the first sighting. Re-stamping on every read would turn "verified
    // on the 16th" into "verified just now", every time the page was opened.
    if (!active.verifiedAt) {
      await setSendingDomain(supabase, {
        id: domain.id,
        name: domain.name,
        from: active.from,
        verifiedAt: new Date().toISOString(),
      });
    }
    return;
  }

  // Cleared only for statuses that mean verification has genuinely lapsed.
  //
  // Not for `pending` or `not_started`, and that exclusion is load-bearing:
  // `POST /verify` moves a domain to `pending` regardless of what it was
  // before, so re-checking an already-verified domain would otherwise wipe the
  // original date and replace it with the time of the re-check a few seconds
  // later. The one honest timestamp available would be destroyed by the act of
  // confirming it was still true.
  const lapsed =
    domain.status === "failed" ||
    domain.status === "temporary_failure" ||
    domain.status === "partially_failed";

  if (lapsed && active.verifiedAt) {
    await setSendingDomain(supabase, {
      id: domain.id,
      name: domain.name,
      from: active.from,
      verifiedAt: null,
    });
  }
}

/**
 * Asks Resend to re-read DNS, then reads the result back.
 *
 * The expensive half of the pair, and the one that must not be repeated on a
 * timer: `POST /verify` moves the domain to `pending` whatever it was before,
 * so calling it every few seconds would keep resetting the very state the
 * caller is waiting to see change. Start a check with this, then poll with
 * `readDomainStatus`.
 */
export async function checkDomainVerification(
  domainId: string,
): Promise<ActionResult<ResendDomain>> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const result = await verifyAndRead(domainId);
  if (!result.ok) return { ok: false, error: result.error };

  await syncVerifiedAt(supabase, result.value);

  revalidateEmail();
  return { ok: true, value: result.value };
}

/**
 * Reads a domain's current state without triggering anything.
 *
 * What the polling loop calls. Resend keeps re-checking DNS on its own for 72
 * hours after a verification is started, so watching for the answer is a plain
 * read — no need to keep asking it to start over, and asking would actively
 * get in the way. See `checkDomainVerification`.
 *
 * Deliberately does not revalidate the page: it runs every few seconds, and
 * busting the route cache on each tick would refetch the whole domain list and
 * the send activity alongside it. The caller re-renders from the returned
 * domain and refreshes once, when the status finally settles.
 */
export async function readDomainStatus(
  domainId: string,
): Promise<ActionResult<ResendDomain>> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const result = await getDomain(domainId);
  if (!result.ok) return { ok: false, error: result.error };

  await syncVerifiedAt(supabase, result.value);

  return { ok: true, value: result.value };
}

/**
 * Points outbound email at a domain.
 *
 * Re-reads the domain from Resend rather than trusting what the page had on
 * screen: the list may have been rendered minutes ago, and selecting a domain
 * that has since fallen out of verification would quietly restore the exact
 * bug this page exists to fix — mail accepted by the API and delivered to
 * nobody.
 *
 * A domain that is not verified is refused outright. There is no reason to
 * allow it: Resend rejects sends from an unverified domain, so permitting the
 * selection would only move the failure somewhere less visible.
 */
export async function selectSendingDomain(input: {
  domainId: string;
  mailbox: string;
}): Promise<ActionResult<{ from: string }>> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const mailbox = input.mailbox.trim().toLowerCase();
  // The local part before the @. Deliberately narrower than RFC 5322 allows:
  // everything exotic that standard permits is a liability in a From header
  // and nobody wants `hello+tag` as their sending identity.
  if (!/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(mailbox)) {
    return {
      ok: false,
      error: "Use letters, numbers, dots, hyphens or underscores — like hello.",
    };
  }

  const result = await getDomain(input.domainId);
  if (!result.ok) return { ok: false, error: result.error };

  const domain = result.value;
  if (domain.status !== "verified") {
    return {
      ok: false,
      error:
        `${domain.name} isn't verified yet, so Resend would reject anything ` +
        `sent from it. Publish its DNS records and check again first.`,
    };
  }

  const settings = await getSettings(supabase);
  const from = buildFromAddress({
    mailbox,
    domain: domain.name,
    businessName: settings?.business_name ?? null,
  });

  const saved = await setSendingDomain(supabase, {
    id: domain.id,
    name: domain.name,
    from,
    verifiedAt: new Date().toISOString(),
  });

  if (!saved.ok) return { ok: false, error: saved.error };

  revalidateEmail();
  return { ok: true, value: { from } };
}

/**
 * Stops sending from the active domain.
 *
 * Leaves the domain registered with Resend — this is "don't send as this", not
 * "delete this". The caller is expected to warn that outbound email drops back
 * to the shared sender, which does not reach clients.
 */
export async function stopSendingFromDomain(): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const result = await clearSendingDomain(supabase);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateEmail();
  return { ok: true, value: null };
}

/**
 * Removes a domain from Resend entirely.
 *
 * Clears the local selection first when the domain being removed is the active
 * one. Ordered that way deliberately: if the delete succeeds and the clear
 * then fails, the app is left sending from a domain Resend no longer knows
 * about, and every subsequent email fails. The reverse leftover — a cleared
 * selection and a domain that still exists — costs one re-selection.
 */
export async function removeDomain(domainId: string): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const settings = await getSettings(supabase);
  const active = sendingDomainOf(settings);

  if (active?.id === domainId) {
    const cleared = await clearSendingDomain(supabase);
    if (!cleared.ok) return { ok: false, error: cleared.error };
  }

  const result = await deleteDomain(domainId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateEmail();
  return { ok: true, value: null };
}
