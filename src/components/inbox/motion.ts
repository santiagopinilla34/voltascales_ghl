/**
 * The shared vocabulary for the Inbox's Framer Motion work.
 *
 * The app's CSS keyframes are still the default everywhere else, and their
 * durations and curves live in `globals.css`. These are the same numbers,
 * restated in the shape `motion` wants, so the two systems cannot drift into
 * two different ideas of what "fast" means. Anything here that has no CSS
 * counterpart — the springs, the exit timings — exists because CSS could not
 * express it in the first place.
 */

/** `--ease-out`. Stronger than the built-in keyword, which is barely a curve. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** How long an element takes to leave. Deliberately shorter than an entrance:
 *  you are already looking at what replaces it, so the old thing should get
 *  out of the way rather than take a bow. */
export const EXIT_MS = 0.14;

/** A new message landing in the thread. A spring rather than a curve because
 *  this is the one moment in the Inbox that should feel physical — something
 *  arrived. Bounce stays low; a message is not a notification toast. */
export const ARRIVE_SPRING = {
  type: "spring",
  duration: 0.42,
  bounce: 0.18,
} as const;

/** The selection travelling between rows in the conversation list. Faster and
 *  flatter than a message arriving: it is tracking a click the user just made,
 *  so it has to keep up with them rather than perform. */
export const SELECT_SPRING = {
  type: "spring",
  duration: 0.32,
  bounce: 0.1,
} as const;

/** Reordering, growing, collapsing — anything where a box changes size. */
export const RESIZE = { duration: 0.24, ease: EASE_OUT } as const;
