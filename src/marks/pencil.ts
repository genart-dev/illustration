/**
 * Pencil mark strategy — multi-pass graphite sketch strokes.
 *
 * Quality Bar 13: Multiple slightly-offset strokes build up value like
 * a pencil pressed and re-stroked over the same path. Individual strokes
 * remain visible (not blended into one). Lighter pressure at ends.
 * Reads as graphite on paper. Fails if single solid line or if extra
 * marks look like errors rather than shading.
 *
 * Approach: 3-5 passes of the full stroke, each slightly offset
 * perpendicular and with varied width/opacity. Deeper segments get
 * additional close-parallel shading strokes (like pressing harder
 * and going back and forth to build tone).
 */

import type {
  StrokeOutline, StrokeProfile, Mark, MarkConfig, MarkStrategy, Point2D,
} from "../types.js";
import { tangent, normalLeft } from "../util/vec.js";
import { cumulativeArcLengths } from "../util/arc-length.js";

export const pencilMark: MarkStrategy = {
  id: "pencil",
  name: "Pencil Sketch",

  generateMarks(
    outline: StrokeOutline,
    profile: StrokeProfile,
    config: MarkConfig,
    rng: () => number,
  ): Mark[] {
    const { points } = profile;
    if (points.length < 2) return [];

    const marks: Mark[] = [];
    const passes = config.passes ?? 3;
    const cumLengths = cumulativeArcLengths(points);
    const totalLength = cumLengths[cumLengths.length - 1]!;

    // Multiple passes — each visibly offset perpendicular to the stroke,
    // simulating re-stroking the same line to build up graphite value.
    // Offsets are wide enough that individual strokes remain distinguishable.
    for (let pass = 0; pass < passes; pass++) {
      const passOffset = (pass - (passes - 1) / 2) * config.weight * 0.5;
      const passWidth = config.weight * (0.4 + rng() * 0.3);
      const passAlpha = 0.25 + rng() * 0.2; // graphite is translucent

      const strokePoints: Point2D[] = [];

      for (let i = 0; i < points.length; i++) {
        const pt = points[i]!;
        const t = totalLength > 0 ? cumLengths[i]! / totalLength : 0;

        // Perpendicular offset for this pass
        let ox = 0;
        let oy = 0;
        if (i > 0 && i < points.length - 1) {
          const tan = tangent(points[i - 1]!, points[i + 1]!);
          const n = normalLeft(tan);
          // Fixed pass offset + random wobble per point (pencil shake)
          const jitter = passOffset + (rng() - 0.5) * config.weight * config.jitter * 0.3;
          ox = n.x * jitter;
          oy = n.y * jitter;
        }

        strokePoints.push({ x: pt.x + ox, y: pt.y + oy });
      }

      // Lighter pressure at endpoints (pencil lift)
      marks.push({
        points: strokePoints,
        width: passWidth,
        opacity: passAlpha,
      });
    }

    // Depth-based shading: additional close-parallel strokes at wider offsets
    // to build tonal value (like pressing harder and shading back and forth).
    // Only for deeper segments — NOT perpendicular hatches.
    const avgDepth = points.reduce((sum, p) => sum + (p.depth ?? 0), 0) / points.length;
    const shadingIntensity = Math.min(1, avgDepth * 0.15) * config.density;

    if (shadingIntensity > 0.05 && totalLength > 10) {
      const extraPasses = Math.max(1, Math.floor(shadingIntensity * 4));

      for (let e = 0; e < extraPasses; e++) {
        // Wider offsets than the main passes — fills in the stroke width
        const offset = (rng() - 0.5) * config.weight * 1.5;
        const strokePoints: Point2D[] = [];
        // Start and end partway along the stroke (partial re-strokes)
        const startT = rng() * 0.3;
        const endT = 0.7 + rng() * 0.3;
        const startIdx = Math.floor(startT * (points.length - 1));
        const endIdx = Math.ceil(endT * (points.length - 1));

        for (let i = startIdx; i <= endIdx && i < points.length; i++) {
          const pt = points[i]!;
          let ox = 0;
          let oy = 0;
          if (i > 0 && i < points.length - 1) {
            const tan = tangent(points[i - 1]!, points[i + 1]!);
            const n = normalLeft(tan);
            ox = n.x * (offset + (rng() - 0.5) * config.weight * 0.2);
            oy = n.y * (offset + (rng() - 0.5) * config.weight * 0.2);
          }
          strokePoints.push({ x: pt.x + ox, y: pt.y + oy });
        }

        if (strokePoints.length >= 2) {
          marks.push({
            points: strokePoints,
            width: config.weight * (0.3 + rng() * 0.4),
            opacity: 0.1 + rng() * 0.2,
          });
        }
      }
    }

    return marks;
  },
};
