"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { setPassword, type SetPasswordState } from "./actions";

const initialState: SetPasswordState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save password and continue"}
    </button>
  );
}

export function SetPasswordForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(setPassword, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {/* Shown, not editable: the password is being set for the account the
          invite was sent to, and letting the field be changed here would imply
          otherwise. Present at all so password managers file it correctly. */}
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          readOnly
          autoComplete="username"
          className="border-input bg-muted text-muted-foreground w-full rounded-md border px-3 py-2 text-sm outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="border-input bg-background focus:border-ring focus:ring-ring w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
        />
        <p className="text-muted-foreground text-xs">
          At least 8 characters. Longer beats complicated.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-sm font-medium">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="border-input bg-background focus:border-ring focus:ring-ring w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
