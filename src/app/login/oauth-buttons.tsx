"use client";

import { useState } from "react";

/**
 * Sign in with Google or Apple.
 *
 * Front end only. Both are real Supabase providers and the code to start the
 * flow is two lines — `supabase.auth.signInWithOAuth({ provider, options: {
 * redirectTo } })` plus a `/auth/callback` route that exchanges the code — but
 * neither works until the provider is configured in the Supabase dashboard,
 * and Apple additionally needs a paid developer account, a Services ID and a
 * signing key. Wiring the call before any of that exists would give a button
 * that fails with a provider error, which is worse than one that says what is
 * missing.
 *
 * The marks are inlined SVG rather than images: they are four paths, and the
 * alternative is four network requests on the one page that renders before the
 * user is authenticated.
 */

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.89c2.27-2.09 3.57-5.17 3.57-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.89-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.95H1.26v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.26a12 12 0 0 0 0 10.78l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.26 6.61l4.01 3.11C6.22 6.88 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4 shrink-0 fill-current"
    >
      <path d="M17.05 12.72c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.04-2.75-4.13ZM14.5 4.86c.71-.87 1.19-2.07 1.06-3.28-1.02.04-2.27.68-3.01 1.54-.66.76-1.24 1.99-1.09 3.16 1.14.09 2.31-.58 3.04-1.42Z" />
    </svg>
  );
}

const PROVIDERS = [
  { id: "google", label: "Continue with Google", Mark: GoogleMark },
  { id: "apple", label: "Continue with Apple", Mark: AppleMark },
] as const;

export function OAuthButtons() {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {PROVIDERS.map(({ id, label, Mark }) => (
          <button
            key={id}
            type="button"
            onClick={() =>
              setNotice(
                `${id === "google" ? "Google" : "Apple"} sign-in isn't switched on yet. Sign in with your email and password below.`,
              )
            }
            className="border-input hover:bg-muted flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition"
          >
            <Mark />
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="text-muted-foreground text-xs">
          {notice}
        </p>
      )}

      {/* A rule with the word "or" sitting in it, drawn with a border on each
          side rather than a background stripe so it survives both themes. */}
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
