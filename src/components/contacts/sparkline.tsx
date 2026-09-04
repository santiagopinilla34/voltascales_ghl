/**
 * The little line under each stat card's number.
 *
 * Deliberately axis-less and label-less: it answers "which way has this been
 * going" and nothing more precise, so drawing a scale for it would promise a
 * reading the shape can't support. The number beside it is the fact; this is
 * the direction that number arrived from.
 *
 * `preserveAspectRatio="none"` because the card decides the box and the curve
 * should fill it — a sparkline stretched horizontally still reads correctly,
 * which is the whole reason the form works at these sizes.
 *
 * Colour comes from `currentColor` on both the stroke and the fill's gradient
 * stops, so a card sets one text colour on the wrapper and the line, the wash
 * beneath it and the end dot all follow. `gradientId` has to be unique per
 * instance: SVG gradient ids are document-global, and four cards sharing one
 * would all take the first card's colour.
 */
export function Sparkline({
  values,
  gradientId,
  className,
}: {
  /** Oldest first. Fewer than two points draws nothing. */
  values: number[];
  gradientId: string;
  className?: string;
}) {
  if (values.length < 2) return null;

  const width = 100;
  const height = 32;
  // Vertical breathing room, so a peak isn't clipped by the viewBox and a
  // trough doesn't sit on the baseline where the fill would hide it.
  const pad = 4;

  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat series has no span to divide by; drawing it down the middle is the
  // honest answer — nothing changed.
  const span = max - min || 1;

  const points = values.map((value, index): [number, number] => [
    (index / (values.length - 1)) * width,
    height - pad - ((value - min) / span) * (height - pad * 2),
  ]);

  // Quadratic segments through the midpoints: each original point becomes a
  // control point rather than a vertex, which rounds the corners off without
  // needing real spline maths or letting the curve overshoot the data.
  let line = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    line += ` Q ${px},${py} ${(px + cx) / 2},${(py + cy) / 2}`;
  }
  const last = points[points.length - 1];
  line += ` L ${last[0]},${last[1]}`;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The wash is the same path closed down to the baseline. It carries no
          information the line doesn't; it stops the line reading as a stray
          hairline on a dark card. */}
      <path
        d={`${line} L ${width},${height} L 0,${height} Z`}
        fill={`url(#${gradientId})`}
        stroke="none"
      />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        // The box is stretched, so a plain stroke would come out thinner
        // vertically than horizontally. This keeps it one weight all the way.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
