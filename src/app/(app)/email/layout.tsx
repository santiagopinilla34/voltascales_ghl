import { EmailTabs } from "@/components/email/email-tabs";

/**
 * The shell both Email screens sit in: the heading, the tabs, and a scroll
 * region below them.
 *
 * A layout rather than a header on each page — layouts are not re-rendered as
 * you move between their children, so switching tabs replaces only the panel
 * underneath and the row you clicked in stays exactly where it was. Modelled on
 * `ai-agents/layout.tsx`, which solved this first.
 *
 * `min-h-0` on both the column and the scroll region is load-bearing, as it is
 * everywhere else in this app: a flex child's default minimum size is its
 * content, so without it the scroll region grows to fit the page instead of
 * scrolling, and the whole window scrolls in its place.
 */
export default function EmailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1400px] items-center gap-4 sm:gap-6">
          {/* The sidebar already says which section this is, and on a phone the
              tabs need every pixel of the row. */}
          <h1 className="hidden shrink-0 text-sm font-semibold tracking-tight sm:block">
            Email
          </h1>
          <EmailTabs />
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
