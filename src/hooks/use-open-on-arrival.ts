"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Whether this screen was arrived at asking for its add dialog to be open.
 *
 * The plus on a source card on the All tab is a link to that source's tab with
 * `?add=1` on it, rather than a button that reaches across into another
 * screen's state. The tab it lands on owns its own dialog, knows what that
 * dialog needs and is the only thing that should be opening it -- so the card
 * states an intention in the URL and the panel decides what to do about it.
 *
 * Read once, as the initial value of state rather than in an effect that sets
 * it a render later: the dialog is open on the first paint or there is a flash
 * of the screen without it.
 *
 * The parameter is then taken back out of the URL. It has been consumed, and
 * left in it would reopen an empty dialog on every refresh and sit in any link
 * somebody copied.
 *
 * `history.replaceState` rather than `router.replace`, which is the version
 * that looks right and does not work. A router replace re-renders the route,
 * and on the second visit -- when the entry is already in the router cache --
 * that came back as a remount: the state below was seeded again, this time
 * from a URL the effect had just cleaned, so the dialog opened and shut on its
 * own. Next reads a bare `replaceState` and keeps `useSearchParams` in step
 * without re-rendering the tree, which changes the address bar and nothing
 * else. That is the whole of what is wanted here.
 */
export function useOpenOnArrival(param = "add"): [boolean, (open: boolean) => void] {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const asked = searchParams.get(param) === "1";
  const [open, setOpen] = useState(asked);

  useEffect(() => {
    if (!asked) return;

    const next = new URLSearchParams(searchParams);
    next.delete(param);
    const query = next.toString();

    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }, [asked, param, pathname, searchParams]);

  return [open, setOpen];
}
