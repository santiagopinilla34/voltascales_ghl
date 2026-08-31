import { FlaskConical } from "lucide-react";

/**
 * Says out loud that the editor below it keeps nothing.
 *
 * The calendar-settings editors are deliberately front-end only: they hold
 * their state in React and lose it on reload. Without this the Save button is
 * a lie — the toast says "saved", the page says nothing, and the next reload
 * quietly throws the work away. Better to admit the shape of the thing than to
 * let someone spend an afternoon configuring hours that were never going
 * anywhere.
 *
 * Delete this component, not just its usages, when these grow a backend.
 */
export function FrontEndOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
      <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
