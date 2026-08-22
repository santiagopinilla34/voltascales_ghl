"use client";

import { usePathname } from "next/navigation";

/**
 * The animation between one page and the next.
 *
 * ## Why this is a plain CSS animation and not a view transition
 *
 * It was a `<ViewTransition>` first, and that is the more capable mechanism —
 * it can animate the old page out, and morph elements shared across routes.
 * The cost is how it works: it photographs the old and new pages and
 * composites both in an overlay painted above the entire document. That
 * overlay is the source of three separate bugs shipped in one afternoon.
 *
 * It paints above fixed elements, so the incoming page was drawn over the
 * mobile navigation sheet. It paints above the chrome, so a few pixels of
 * upward travel on the outgoing page landed on top of the top bar. And
 * because both pages exist at once inside it, any gap or misalignment
 * between their two animations shows as one page laid over the other.
 *
 * Every one of those is a stacking problem, and none of them exists here.
 * Changing the `key` makes React unmount the old page and mount the new one,
 * so **only one page is ever on screen** — there is nothing to overlap, and
 * nothing composited above the sidebar or the top bar. What is lost is the
 * exit animation, which was 160ms of fading that left the content area
 * momentarily blank anyway.
 *
 * ## Why it keys on the section, not the path
 *
 * The key is the first path segment — `inbox`, `contacts`, `pipeline` — so
 * moving *between* sections animates and moving *within* one does not.
 * Opening a second conversation from the inbox list is not "going to a new
 * page", it is changing what the right-hand pane shows, and animating it
 * would put a flourish on every click in the app's busiest list. It is also
 * the safer key: `/inbox` has its own layout holding the conversation list,
 * and keying on the full path would remount that layout on every
 * conversation, throwing away the list's scroll position.
 *
 * The animation itself is in `globals.css` under `.page-enter`, and the
 * sidebar and top bar sit outside this, in the layout, so they stay still.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = pathname.split("/")[1] ?? "";

  return (
    <div key={section} className="page-enter flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
