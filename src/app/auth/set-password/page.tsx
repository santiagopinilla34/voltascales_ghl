import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";

import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose a password · VoltaScales" };

/**
 * Where an invited client lands after clicking the link in their email.
 *
 * By the time this renders, `/auth/confirm` has already exchanged the token
 * for a session — so this page has a signed-in user who simply has no password
 * yet. Anyone arriving without one followed a stale or reused link, and gets
 * sent to sign in rather than a form that cannot work.
 */
export default async function SetPasswordPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("That invite link has expired. Ask for a new one."));
  }

  const { data: membership } = await supabase
    .from("org_members")
    .select("organizations (name)")
    .eq("user_id", user.id)
    .maybeSingle();

  const orgName = membership?.organizations?.name ?? null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <Logo className="h-7 self-start" />
        <h1 className="text-xl font-semibold tracking-tight">
          Choose a password
        </h1>
        <p className="text-muted-foreground text-sm">
          {orgName ? (
            <>
              You&apos;ve been given access to <strong>{orgName}</strong>. Pick a
              password and it&apos;s yours — nobody else can see it, including
              whoever invited you.
            </>
          ) : (
            <>
              Pick a password to finish setting up your account. Nobody else can
              see it, including whoever invited you.
            </>
          )}
        </p>
      </div>

      <SetPasswordForm email={user.email ?? ""} />
    </main>
  );
}
