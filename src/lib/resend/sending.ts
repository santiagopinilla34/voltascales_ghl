import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { SETTINGS_ID } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Settings } from "@/types/database";

/**
 * Which domain this app sends from, and the address it sends as.
 *
 * The counterpart to `src/lib/resend/domains.ts`: that module is Resend's view
 * of the world, this one is ours. Resend knows which domains exist and whether
 * their DNS resolves; it has no opinion about which of them a given app should
 * put in its From header. That choice is the only thing stored locally.
 *
 * See the migration `20260816000000_sending_domain.sql` for why this lives in
 * the database rather than in NOTIFY_FROM_EMAIL.
 */

export type SendingDomain = {
  /** Resend's domain id. */
  id: string;
  name: string;
  /** The full From header, e.g. 'VoltaScales <hello@info.voltascales.com>'. */
  from: string;
  /**
   * When this app first confirmed the domain verified — not Resend's own
   * timestamp, which does not exist. Null if it was selected before a check
   * ever came back verified.
   */
  verifiedAt: string | null;
};

/** The active selection, or null when none has been made. */
export function sendingDomainOf(settings: Settings | null): SendingDomain | null {
  if (!settings?.sending_domain_id || !settings.sending_from_email) return null;

  return {
    id: settings.sending_domain_id,
    name: settings.sending_domain_name ?? "",
    from: settings.sending_from_email,
    verifiedAt: settings.sending_verified_at,
  };
}

/** Resend's shared sender, which only delivers to the account owner. */
export const SHARED_SENDER = "VoltaScales <onboarding@resend.dev>";

/**
 * Where outbound email is actually sent from, and how that was decided.
 *
 * Three sources in precedence order, and the third is the bug this page was
 * built to fix: a verified domain chosen here, else the NOTIFY_FROM_EMAIL
 * environment variable, else Resend's shared sender — which is accepted by the
 * API and delivered only to the address the Resend account was registered
 * with. Client mail sent from it does not bounce visibly. It simply never
 * arrives.
 *
 * Returns the source alongside the address because the page needs to say which
 * of the three is in force, and "onboarding@resend.dev" means nothing to
 * someone who has not read this comment.
 */
export function resolveFromAddress(settings: Settings | null): {
  from: string;
  source: "domain" | "environment" | "shared";
} {
  const domain = sendingDomainOf(settings);
  if (domain) return { from: domain.from, source: "domain" };

  const configured = process.env.NOTIFY_FROM_EMAIL?.trim();
  if (configured) return { from: configured, source: "environment" };

  return { from: SHARED_SENDER, source: "shared" };
}

/**
 * The From address, read fresh from the database.
 *
 * The async counterpart to `resolveFromAddress`, for the send path — which has
 * no settings row in hand and, in the webhook cases, no user session either.
 * Uses the service-role client for that reason.
 *
 * Never throws, and never lets a database problem stop an email going out.
 * Modelled on `resolveForwardToNumber`, which makes the same trade for the
 * same reason: falling back to the environment sends the message from a
 * less-good address, while propagating the error sends nothing at all. Of
 * those two, only one loses the message.
 *
 * Read on every send rather than cached. Changing the sending domain is meant
 * to take effect immediately, and this is one indexed lookup on a single-row
 * table against work that already involves an HTTP round trip to Resend.
 */
export async function resolveSendingFrom(orgId?: string): Promise<string> {
  try {
    const supabase = createAdminClient();

    // Without an organization this matches every settings row and fails. That
    // is the intended outcome for a caller that has not been taught whose mail
    // it is sending — the fallback below is a worse address, not a wrong
    // account, whereas picking an arbitrary row would send a client's mail
    // from another client's domain.
    const base = supabase.from("settings").select("sending_from_email");
    const { data, error } = orgId
      ? await base.eq("org_id", orgId).maybeSingle()
      : await base.eq("id", SETTINGS_ID).maybeSingle();

    if (error) {
      console.error(
        "[email] sending-address lookup failed, falling back to NOTIFY_FROM_EMAIL",
        error,
      );
    } else {
      const configured = data?.sending_from_email?.trim();
      if (configured) return configured;
    }
  } catch (error) {
    console.error(
      "[email] sending-address lookup threw, falling back to NOTIFY_FROM_EMAIL",
      error,
    );
  }

  return process.env.NOTIFY_FROM_EMAIL?.trim() || SHARED_SENDER;
}

/**
 * Makes a domain the one outbound email sends from.
 *
 * `verifiedAt` is stamped by the caller rather than defaulted to `now()` here,
 * because the honest value is "when a check came back verified", and the caller
 * is the one holding that check's result. Selecting a domain whose status is
 * anything other than verified leaves it null, which the dashboard reads as
 * "chosen, not yet confirmed" rather than inventing a date.
 */
export async function setSendingDomain(
  supabase: SupabaseClient<Database>,
  input: { id: string; name: string; from: string; verifiedAt: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("settings")
    .update({
      sending_domain_id: input.id,
      sending_domain_name: input.name,
      sending_from_email: input.from,
      sending_verified_at: input.verifiedAt,
    })
    .eq("id", SETTINGS_ID);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Stops sending from a domain.
 *
 * Outbound email then falls back to NOTIFY_FROM_EMAIL, and if that is unset,
 * to Resend's shared sender — which is the state that caused client email to
 * bounce silently in the first place. Callers are expected to say so out loud
 * rather than treating this as a neutral action.
 */
export async function clearSendingDomain(
  supabase: SupabaseClient<Database>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("settings")
    .update({
      sending_domain_id: null,
      sending_domain_name: null,
      sending_from_email: null,
      sending_verified_at: null,
    })
    .eq("id", SETTINGS_ID);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Builds a From header from a mailbox and the business's name.
 *
 * A display name is not decoration: without one the recipient sees the bare
 * address, and `hello@info.voltascales.com` in a client's inbox is markedly
 * less recognisable than `VoltaScales`. Falls back to the domain when no
 * business name is set, which still beats nothing.
 *
 * Quoted only when the name contains a character that would otherwise break
 * the header — a comma in a display name is what turns one recipient into two.
 */
export function buildFromAddress(input: {
  mailbox: string;
  domain: string;
  businessName: string | null;
}): string {
  const address = `${input.mailbox}@${input.domain}`;
  const name = input.businessName?.trim();

  if (!name) return address;

  const needsQuoting = /[",:;<>@\[\]\\]/.test(name);
  const display = needsQuoting ? `"${name.replace(/(["\\])/g, "\\$1")}"` : name;

  return `${display} <${address}>`;
}
