"use server";

import { markConversationRead } from "@/lib/conversations";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";

/**
 * Records that this user has seen everything in a conversation.
 *
 * Runs as the logged-in user on the session client, not the service role, so
 * the row's own policy applies: `user_id = auth.uid()` is enforced by the
 * database rather than trusted from the argument. The action takes only the
 * contact id for the same reason — a caller who could name the user would be a
 * caller who could mark somebody else's conversation read.
 *
 * The organization comes from the contact, so an agency admin working inside a
 * client files the marker against that client. `requireOrgContext` supplies the
 * user; the contact read below supplies the account.
 */
export async function markRead(contactId: string): Promise<void> {
  const context = await requireOrgContext();
  const supabase = await createClient();

  // Read through RLS rather than taking an org id from the caller. A contact
  // outside the current scope simply does not come back, and the marker is not
  // written — which is the correct outcome and needs no check of its own.
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, org_id")
    .eq("id", contactId)
    .maybeSingle();

  if (!contact) return;

  await markConversationRead(supabase, {
    userId: context.userId,
    contactId: contact.id,
    orgId: contact.org_id,
  });
}
