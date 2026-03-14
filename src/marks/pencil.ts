/**
 * Pencil mark strategy — multi-pass graphite sketch strokes.
 *
 * Quality Bar 13: Multiple slightly-offset strokes build up value.
 * Individual strokes visible (not blended). Lighter pressure at ends.
 * Reads as graphite on paper. Fails if single solid line or perfectly
 * overlapping strokes.
 *
 * Based on pencil patterns from plugin-plants: 3 passes with perpendicular
 * offset, variable alpha per pass (graphite grain), cross-hatching shading.
 */

import type {
  StrokeOutline, StrokeProfile, Mark, MarkConfig, MarkStrategy, Point2D,
} from "../types.js";
import { tangent, normalLeft, add, scale } from "../util/vec.js";
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

    // Multiple passes — each slightly offset perpendicular to the stroke
    for (let pass = 0; pass < passes; pass++) {
      const passOffset = (pass - (passes - 1) / 2) * config.weight * 0.25 * config.jitter;
      const passWidth = config.weight * (0.7 + rng() * 0.5 * config.jitter);
      const passAlpha = 0.25 + rng() * 0.35; // graphite is translucent

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
          // Fixed pass offset + random jitter per point
          const jitter = passOffset + (rng() - 0.5) * config.weight * config.jitter * 0.3;
          ox = n.x * jitter;
          oy = n.y * jitter;
        }

        // Lighter pressure at ends (graphite lift)
        const endFade = 1 - 0.4 * Math.pow(Math.abs(2 * t - 1), 2);

        strokePoints.push({
          x: pt.x + ox,
          y: pt.y + oy,
        });
      }

      marks.push({
        points: strokePoints,
        width: passWidth,
        opacity: passAlpha,
      });
    }

    // Cross-hatching marks along the stroke for shading (depth-dependent)
    const avgDepth = points.reduce((sum, p) => sum + (p.depth ?? 0), 0) / points.length;
    const hatchDensity = Math.min(1, avgDepth * 0.2 + 0.1) * config.density;

    if (hatchDensity > 0.05 && totalLength > 10) {
      const hatchCount = Math.max(1, Math.floor(totalLength * hatchDensity * 0.15));
      const hatchLen = config.weight * 1.8;

      for (let h = 0; h < hatchCount; h++) {
        const t = (h + rng() * 0.3) / hatchCount;
        const idx = Math.min(Math.floor(t * (points.length - 1)), points.length - 2);
        const pt = points[idx]!;
        const tan = tangent(points[idx]!, points[idx + 1]!);
        const n = normalLeft(tan);

        // Primary hatch — perpendicular to stroke
        const cx = pt.x + (rng() - 0.5) * config.weight * 0.5;
        const cy = pt.y + (rng() - 0.5) * config.weight * 0.5;

        marks.push({
          points: [
            { x: cx - n.x * hatchLen * 0.5, y: cy - n.y * hatchLen * 0.5 },
            { x: cx + n.x * hatchLen * 0.5, y: cy + n.y * hatchLen * 0.5 },
          ],
          width: config.weight * 0.3,
          opacity: 0.2 + rng() * 0.25,
        });

        // Secondary diagonal hatch (deeper segments only)
        if (avgDepth >= 3 && rng() < 0.5) {
          const cos45 = Math.cos(Math.PI / 4);
          const sin45 = Math.sin(Math.PI / 4);
          const dn = {
            x: cos45 * n.x - sin45 * n.y,
            y: sin45 * n.x + cos45 * n.y,
          };
          marks.push({
            points: [
              { x: cx - dn.x * hatchLen * 0.4, y: cy - dn.y * hatchLen * 0.4 },
              { x: cx + dn.x * hatchLen * 0.4, y: cy + dn.y * hatchLen * 0.4 },
            ],
            width: config.weight * 0.25,
            opacity: 0.15 + rng() * 0.2,
          });
        }
      }
    }

    return marks;
  },
};
