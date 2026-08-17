import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { SETTINGS_ID } from "@/lib/settings";
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
