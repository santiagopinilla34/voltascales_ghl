import type { Metadata } from "next";

import { Logo } from "@/components/logo";

import { LoginForm } from "./login-form";
import { OAuthButtons } from "./oauth-buttons";

export const metadata: Metadata = {
  title: "Sign in · VoltaScales",
};

/**
 * `?error=` carries the reason someone was sent here — an expired invite link,
 * a spent token, an account attached to no organization. Without this the
 * three redirects that set it would drop their explanation and leave an
 * invited client staring at a form, unable to tell a broken link from a typo.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Still an <h1> — the logo's alt text is what names the page. */}
        <h1>
          <Logo className="h-8" priority />
        </h1>
        <p className="text-muted-foreground mt-1 mb-6 text-sm">
          Sign in to continue.
        </p>

        {error && (
          <p
            role="alert"
            className="text-destructive bg-destructive/10 mb-4 rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}
        {/* Above the form, which is the convention: the one-tap options come
            first and the password is the fallback under them. */}
        <OAuthButtons />
        <div className="mt-3">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
