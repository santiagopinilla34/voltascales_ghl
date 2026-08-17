"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

/**
 * Which account the app is pretending to be inside.
 *
 * This is a simulation of org-context switching, not the thing itself. A real
 * switch changes what the *server* will hand you: the session carries an
 * organization, RLS filters every query by it, and no amount of poking at the
 * browser gets you another client's contacts. This changes what the browser
 * draws. Nothing more.
 *
 * Kept deliberately small — an id and a name — because that is all the real
 * one would put in a session too. Everything else is looked up.
 *
 * ## Why sessionStorage and not React state alone
 *
 * State alone survives client-side navigation but not a refresh, and being
 * thrown back to the admin view every time you reload is a poor demo of a
 * thing that is meant to feel persistent. sessionStorage keeps it for the tab
 * and forgets it when the tab closes, which is about the right lifetime for
 * something that isn't real.
 */

export type ViewingOrg = {
  id: string;
  name: string;
};

type OrgContextValue = {
  /** The sub account being viewed, or null for your own admin view. */
  org: ViewingOrg | null;
  /** True once sessionStorage has been read; false for the first render only. */
  ready: boolean;
  enter: (org: ViewingOrg) => void;
  leave: () => void;
};

const OrgContext = createContext<OrgContextValue | null>(null);

const STORAGE_KEY = "voltascales:simulated-org";

/**
 * Runs before paint in the browser, and is `useEffect` on the server so React
 * doesn't warn about a layout effect it cannot run.
 *
 * The timing matters here rather than being a micro-optimisation. The server
 * renders your real pages, the first client render has to match that or
 * hydration fails, and the swap to the simulated account happens in this
 * effect. As a layout effect it lands before the browser paints, so your own
 * contacts are never actually shown inside a client account. As a plain
 * effect, they would flash up first.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function readStored(): ViewingOrg | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);

    // Hand-editable storage, so this is checked rather than cast. A bad value
    // means no context, not a crash on every page in the app.
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as ViewingOrg).id === "string" &&
      typeof (parsed as ViewingOrg).name === "string"
    ) {
      return { id: (parsed as ViewingOrg).id, name: (parsed as ViewingOrg).name };
    }
  } catch {
    // Private-mode storage throws, and so does malformed JSON. Neither is
    // worth more than falling back to the admin view.
  }

  return null;
}

export function OrgContextProvider({ children }: { children: React.ReactNode }) {
  const [org, setOrg] = useState<ViewingOrg | null>(null);
  const [ready, setReady] = useState(false);

  useIsomorphicLayoutEffect(() => {
    setOrg(readStored());
    setReady(true);
  }, []);

  const enter = useCallback((next: ViewingOrg) => {
    setOrg(next);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Losing it across a refresh is survivable; failing to switch is not.
    }
  }, []);

  const leave = useCallback(() => {
    setOrg(null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // As above.
    }
  }, []);

  const value = useMemo(
    () => ({ org, ready, enter, leave }),
    [org, ready, enter, leave],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrgContext(): OrgContextValue {
  const value = useContext(OrgContext);

  if (!value) {
    throw new Error("useOrgContext must be used inside an OrgContextProvider");
  }

  return value;
}
