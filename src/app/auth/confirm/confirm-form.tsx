"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { confirmLink, type ConfirmState } from "./actions";

const initialState: ConfirmState = { error: null };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Checking the link…" : label}
    </button>
  );
}

/**
 * The button that spends the token.
 *
 * Everything it needs is in hidden fields, carried over from the query string.
 * Nothing secret is added by doing so — it all arrived in the URL, which the
 * recipient's browser already has — and it means the token is spent by a POST
 * that only a person performs.
 */
export function ConfirmForm({
  tokenHash,
  code,
  type,
  next,
  label,
}: {
  tokenHash: string;
  code: string;
  type: string;
  next: string;
  label: string;
}) {
  const [state, formAction] = useActionState(confirmLink, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />

      {state.error && (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      <SubmitButton label={label} />
    </form>
  );
}
