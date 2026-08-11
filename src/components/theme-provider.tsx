"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Theme context for the whole app.
 *
 * `attribute="class"` puts `.dark` on <html>, which is what the `dark` custom
 * variant in globals.css keys off. `defaultTheme="system"` means an untouched
 * install follows the OS — the phone switching to dark at night should take the
 * app with it — and an explicit choice from the toggle overrides it from then
 * on.
 *
 * Client-side by necessity: the stored preference lives in localStorage, which
 * the server cannot read. That is also why <html> carries
 * `suppressHydrationWarning` — next-themes sets the class in a blocking inline
 * script before paint, so the served markup and the hydrated markup genuinely
 * differ by that one attribute, and the alternative is a white flash on every
 * load.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
