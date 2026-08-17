"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type SetPasswordState = { error: string | null };

/**
 * Where an invited client chooses their password.
 *
 * Runs as the invited user, on the session the invite link just created — so
 * `updateUser` changes their own password and nobody else's, and the agency is
 * never in possession of it. The account is also marked active here, because
 * choosing a password is the first thing only the real recipient of the email
 * can do.
 *
 * Eight characters is Supabase's own floor. No composition rules on top of it:
 * they push people towards `Passw0rd!` and away from length, which is the only
 * thing that reliably helps.
 */
const MINIMUM = 8;

export async function setPassword(
  _prevState: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MINIMUM) {
    return { error: `Use at least ${MINIMUM} characters.` };
  }
  if (password !== confirm) {
    return { error: "Those two passwords don't match." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "That invite link has expired. Ask for a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };

  // Invited -> active, now that someone has actually arrived. Goes through a
  // definer function because writing to `organizations` is otherwise the
  // agency's privilege — see the migration for why this is one narrow function
  // rather than a policy letting clients update their own row.
  //
  // Best effort: a client who could not sign in because a status column did not
  // update would be a far worse outcome than a stale badge on the agency's list.
  const { error: statusError } = await supabase.rpc("activate_my_organizations");

  if (statusError) {
    console.error("[auth] could not mark organization active", statusError);
  }

  revalidatePath("/", "layout");
  redirect("/inbox");
}
