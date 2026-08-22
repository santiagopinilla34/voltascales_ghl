/**
 * The shape every right-hand panel takes: the step picker, the trigger picker
 * and the node config form.
 *
 * One constant rather than the same class string written out three times,
 * because the three panels are the same object in two different layouts and
 * the layouts have to agree.
 *
 * On a wide screen the panel is a column beside the canvas, and the canvas
 * gives up the width. Below `lg` there is no width to give up — a 340px panel
 * next to a 375px phone leaves nothing to look at — so it becomes a sheet over
 * the bottom of the canvas instead, capped at two thirds of the height so the
 * rule stays visible behind it. That is why the builder's row is `relative`.
 *
 * ## It animates open but not shut
 *
 * The panels are rendered conditionally, so React unmounts them the moment
 * they close and there is nothing left on screen to animate. A closing
 * animation needs the node kept alive for its duration — the presence
 * bookkeeping every dialog library exists to do — and the builder's panel
 * state is three interacting conditions (which picker, and whether exactly one
 * node is selected), so that is a real change rather than a class.
 *
 * Opening is the half that carries the meaning: it says where the panel came
 * from. Dismissal already feels immediate because you asked for it. Worth
 * revisiting if these ever become dismissable by clicking away, where a
 * disappearance with no acknowledgement reads as a glitch.
 *
 * `min-h-0` is load-bearing, not decoration. Without it the aside takes its
 * height from its content — a flex item defaults to `min-height: auto` — and
 * a long picker pushes its own footer off the bottom of the screen instead of
 * scrolling the list in the middle.
 *
 * Client-safe.
 */
export const PANEL_SHELL =
  "bg-card absolute inset-x-0 bottom-0 z-20 flex max-h-[66%] min-h-0 min-w-0 flex-col rounded-t-xl border-t shadow-lg " +
  "lg:static lg:z-auto lg:max-h-none lg:w-[340px] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none " +
  // Arrives from the edge it is attached to: up from the bottom as a sheet,
  // in from the right as a column. Short, and no exit — see the note below.
  "animate-in duration-200 ease-out fade-in-0 slide-in-from-bottom-4 lg:slide-in-from-bottom-0 lg:slide-in-from-right-4";
