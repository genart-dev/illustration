/**
 * Ink mark strategy — confident stroke with visible width variation.
 *
 * Quality Bar 12: S-curve rendered with clear thick/thin transition
 * from pressure. Slight darkening at endpoints (ink pooling). Reads as a
 * single gesture with natural width variation. Fails if perfectly uniform
 * or if width variation isn't visible.
 */

import type {
  StrokeOutline, StrokeProfile, Mark, MarkConfig, MarkStrategy, Point2D,
} from "../types.js";
import { tangent, normalLeft } from "../util/vec.js";
import { cumulativeArcLengths } from "../util/arc-length.js";

export const inkMark: MarkStrategy = {
  id: "ink",
  name: "Ink Line",

  generateMarks(
    outline: StrokeOutline,
    profile: StrokeProfile,
    config: MarkConfig,
    rng: () => number,
  ): Mark[] {
    const { points } = profile;
    if (points.length < 2) return [];

    const marks: Mark[] = [];
    const cumLengths = cumulativeArcLengths(points);
    const totalLength = cumLengths[cumLengths.length - 1]!;

    // 1. Filled outline polygon — shows the natural thick/thin width variation
    // from the stroke profile. This is what makes ink look like ink.
    {
      const poly: Point2D[] = [];
      for (const p of outline.startCap) poly.push(p);
      for (const p of outline.left) poly.push(p);
      for (const p of outline.endCap) poly.push(p);
      for (let i = outline.right.length - 1; i >= 0; i--) poly.push(outline.right[i]!);

      if (poly.length >= 3) {
        // Add slight edge wobble for hand-drawn quality
        const jitterAmt = config.weight * config.jitter * 0.08;
        if (jitterAmt > 0) {
          for (let i = 0; i < poly.length; i++) {
            poly[i] = {
              x: poly[i]!.x + (rng() - 0.5) * jitterAmt,
              y: poly[i]!.y + (rng() - 0.5) * jitterAmt,
            };
          }
        }

        marks.push({
          points: poly,
          width: 0, // filled polygon
          opacity: 0.9 + rng() * 0.1,
        });
      }
    }

    // 2. Centerline reinforcement — darker along the center for ink density
    {
      const centerPts: Point2D[] = [];
      const jitterAmt = config.weight * config.jitter * 0.3;
      for (let i = 0; i < points.length; i++) {
        const pt = points[i]!;
        let jx = 0, jy = 0;
        if (jitterAmt > 0 && i > 0 && i < points.length - 1) {
          const tan = tangent(points[i - 1]!, points[i + 1]!);
          const n = normalLeft(tan);
          const offset = (rng() - 0.5) * jitterAmt;
          jx = n.x * offset;
          jy = n.y * offset;
        }
        centerPts.push({ x: pt.x + jx, y: pt.y + jy });
      }
      marks.push({
        points: centerPts,
        width: config.weight * 0.3,
        opacity: 0.3 + rng() * 0.15,
      });
    }

    // 3. Ink pooling at endpoints
    if (config.density > 0.3 && totalLength > 5) {
      const poolRadius = config.weight * 0.5;
      const startPt = points[0]!;
      const endPt = points[points.length - 1]!;

      if (rng() < 0.6) {
        marks.push({
          points: [{ x: startPt.x, y: startPt.y }],
          width: poolRadius * (0.8 + rng() * 0.4),
          opacity: 0.4 + rng() * 0.3,
        });
      }
      if (rng() < 0.8) {
        marks.push({
          points: [{ x: endPt.x, y: endPt.y }],
          width: poolRadius * (1.0 + rng() * 0.5),
          opacity: 0.5 + rng() * 0.3,
        });
      }
    }

    return marks;
  },
};
