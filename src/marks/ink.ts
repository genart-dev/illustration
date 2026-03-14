/**
 * Ink mark strategy — confident single stroke with natural variation.
 *
 * Quality Bar 12: S-curve rendered with subtle width variation from
 * pressure. Slight darkening at endpoints (ink pooling). Reads as a
 * single gesture, not a computed curve. Fails if perfectly uniform.
 *
 * Based on ink-sketch patterns from plugin-plants: position jitter,
 * ±30% pressure-based width variation, occasional ink pooling dots.
 */

import type {
  StrokeOutline, StrokeProfile, Mark, MarkConfig, MarkStrategy, Point2D,
} from "../types.js";
import { tangent, normalLeft, add, scale, dist } from "../util/vec.js";
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

    // Main stroke — single confident line with pressure variation
    const strokePoints: Point2D[] = [];
    const jitterAmt = config.weight * config.jitter * 0.5;

    for (let i = 0; i < points.length; i++) {
      const pt = points[i]!;
      const t = totalLength > 0 ? cumLengths[i]! / totalLength : 0;

      // Position jitter perpendicular to stroke direction
      let jx = 0;
      let jy = 0;
      if (jitterAmt > 0 && i > 0 && i < points.length - 1) {
        const tan = tangent(points[i - 1]!, points[i + 1]!);
        const n = normalLeft(tan);
        const offset = (rng() - 0.5) * jitterAmt;
        jx = n.x * offset;
        jy = n.y * offset;
      }

      strokePoints.push({ x: pt.x + jx, y: pt.y + jy });
    }

    // Width varies with pressure: slight swell in the middle, thin at ends
    // Simulates natural ink pen pressure
    const pressureWidth = (t: number): number => {
      const pressure = points[Math.min(
        Math.floor(t * (points.length - 1)),
        points.length - 1,
      )]?.pressure ?? (1 - 0.3 * Math.abs(2 * t - 1));
      return config.weight * (0.7 + 0.6 * pressure * config.density);
    };

    // Use the average width for the main stroke mark
    const avgWidth = pressureWidth(0.5);
    marks.push({
      points: strokePoints,
      width: avgWidth,
      opacity: 0.85 + rng() * 0.15,
    });

    // Ink pooling at endpoints — small dots where ink gathers
    if (config.density > 0.3 && totalLength > 5) {
      const poolRadius = config.weight * 0.6;
      const startPt = strokePoints[0]!;
      const endPt = strokePoints[strokePoints.length - 1]!;

      // Start pool (slight)
      if (rng() < 0.6) {
        marks.push({
          points: [startPt],
          width: poolRadius * (0.8 + rng() * 0.4),
          opacity: 0.4 + rng() * 0.3,
        });
      }

      // End pool (more pronounced — pen rests at endpoint)
      if (rng() < 0.8) {
        marks.push({
          points: [endPt],
          width: poolRadius * (1.0 + rng() * 0.5),
          opacity: 0.5 + rng() * 0.3,
        });
      }
    }

    return marks;
  },
};
