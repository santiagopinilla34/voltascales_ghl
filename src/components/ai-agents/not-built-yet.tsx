import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * What the three unbuilt tabs show.
 *
 * They exist as routes from the start so the tab row is the real shape of the
 * section rather than one tab that grows neighbours later, and so the links on
 * Getting Started have somewhere to go. That leaves three screens with nothing
 * on them, and the honest thing to put there is a note saying so and saying
 * what is coming — not a spinner, and not a fake list of agents nobody made.
 *
 * Shared rather than written three times: the three differ by an icon, a name
 * and a sentence, and the day one of them stops being a placeholder it simply
 * stops importing this.
 */
export function NotBuiltYet({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** What this screen will do, once it does anything. */
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1140px] px-4 py-4 sm:px-6 lg:px-10">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-16 text-center">
        <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
          <Icon className="size-4" />
        </span>

        <p className="text-sm font-medium">{title} isn&apos;t built yet</p>

        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          {children}
        </p>

        <p className="text-muted-foreground max-w-md pt-1 text-xs">
          Until then,{" "}
          <Link
            href="/ai-agents"
            className="hover:text-foreground underline underline-offset-2"
          >
            Getting Started
          </Link>{" "}
          covers what each agent will do for the business.
        </p>
      </div>
    </div>
  );
}
