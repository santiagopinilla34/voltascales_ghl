import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/logo";

import { ConfirmForm } from "./confirm-form";
import { linkType, safeNext } from "./link-target";

export const metadata: Metadata = { title: "Your link · VoltaScales" };

/**
 * Where every emailed link lands: invites, password resets, magic links.
 *
 * This used to be a Route Handler that verified the token the moment the URL
 * was fetched, and that is what broke the first real invite — a mail scanner
 * fetched it eighteen seconds after it was sent and spent the token, so the
 * client's own click two hours later failed. The whole file is now a page with
 * a button on it, and nothing is verified until the button is pressed.
 *
 * It also has to say so when a link is dead. The old handler redirected to
 * `/login?error=…`, which the proxy then threw away for anyone who happened to
 * be signed in already — it bounces a session off `/login` and clears the
 * query string on the way. The agency admin who clicked a client's spent
 * invite landed on `/inbox` with the reason living in a URL fragment the
 * server never sees. Rendering the message here instead means nothing is in a
 * position to strip it.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string;
    code?: string;
    type?: string;
    next?: string;
  }>;
}) {
  const params = await searchParams;

  const tokenHash = params.token_hash ?? "";
  const code = params.code ?? "";
  const type = linkType(params.type);
  const next = safeNext(params.next);

  const usable = (tokenHash && type) || code;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <Logo className="h-7 self-start" />
        <h1 className="text-xl font-semibold tracking-tight">
          {usable ? headingFor(type) : "This link can't be used"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {usable ? (
            bodyFor(type)
          ) : (
            <>
              It&apos;s missing its token, which usually means it was already
              used once. Ask whoever set up your account for a new one — it
              takes them a click.
            </>
          )}
        </p>
      </div>

      {usable ? (
        <ConfirmForm
          tokenHash={tokenHash}
          code={code}
          type={type ?? ""}
          next={next}
          label={labelFor(type)}
        />
      ) : (
        <Link
          href="/login"
          className="border-input hover:bg-muted w-full rounded-md border px-3 py-2 text-center text-sm font-medium transition"
        >
          Go to sign in
        </Link>
      )}
    </main>
  );
}

function headingFor(type: string | null): string {
  if (type === "recovery") return "Reset your password";
  if (type === "invite") return "You've been invited";
  return "Confirm it's you";
}

function bodyFor(type: string | null): string {
  if (type === "recovery") {
    return "Confirm below and you'll be able to choose a new password.";
  }
  if (type === "invite") {
    return "Confirm below and you'll be asked to choose a password. Nobody else can see it, including whoever invited you.";
  }
  return "Confirm below to finish signing in.";
}

function labelFor(type: string | null): string {
  if (type === "recovery") return "Choose a new password";
  if (type === "invite") return "Set up my account";
  return "Continue";
}
