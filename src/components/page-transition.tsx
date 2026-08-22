"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/**
 * The animation between one page and the next.
 *
 * ## Why it keys on the section, not the path
 *
 * The key is the first path segment — `inbox`, `contacts`, `pipeline` — so
 * moving *between* sections animates and moving *within* one does not.
 *
 * That is a design decision before it is a technical one. Opening a second
 * conversation from the inbox list is not "going to a new page", it is
 * changing what the right-hand pane shows; animating it would put a flourish
 * on every click in the app's busiest list. It is also the safer key:
 * `/inbox` has its own layout holding the conversation list, and keying on the
 * full path would remount that layout on every conversation — throwing away
 * the list's scroll position to play an animation nobody asked for.
 *
 * ## Why it lives here rather than in each page
 *
 * Next's guide puts the wrapper in every `page.tsx`, because a layout persists
 * across navigations and so its enter and exit never fire. That is true of a
 * wrapper whose identity is stable — but a changing `key` makes React unmount
 * the old subtree and mount the new one, which is exactly the exit/enter pair
 * the animation needs. One wrapper here, rather than twenty pages each
 * remembering to opt in and one of them forgetting.
 *
 * The sidebar and the top bar sit outside this, in the layout, so they stay
 * still while the content moves. Anchoring them is what keeps the transition
 * legible: the *content* changed, not the whole window.
 *
 * The animation itself is in `globals.css` under `.page` — 120ms out, 220ms
 * in, and a 6px rise. Reduced motion drops all of it.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = pathname.split("/")[1] ?? "";

  return (
    <ViewTransition key={section} enter="page" exit="page" default="none">
      {children}
    </ViewTransition>
  );
}
