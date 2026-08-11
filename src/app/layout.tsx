import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VoltaScales",
  description: "Personal automation & CRM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: next-themes writes the theme class onto this
    // element before React hydrates, so server and client markup differ here by
    // design. Scoped to <html>, it does not mask mismatches anywhere else.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} h-full font-sans antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
