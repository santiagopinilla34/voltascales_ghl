import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · VoltaScales",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold tracking-tight">VoltaScales</h1>
        <p className="text-muted-foreground mt-1 mb-6 text-sm">
          Sign in to continue.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
