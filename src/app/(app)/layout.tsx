import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { signOut } from "./actions";

/**
 * Shell for every authenticated page.
 *
 * The middleware already redirects anonymous requests, but this re-checks on
 * the server so a page can never render without a verified user.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">VoltaScales</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-500">{user.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-neutral-500 transition hover:text-neutral-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
