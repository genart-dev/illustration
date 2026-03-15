/**
 * Brush / sumi-e mark strategy — wide strokes with wet/dry variation.
 *
 * Quality Bar 16: Wide stroke with visible thick→thin transition.
 * Thick at start (ink loaded), tapering thin at end (brush lifting/dry).
 * Dry-brush texture in the trailing portion — stroke breaks into 3-5 thin
 * parallel filaments. Wet pooling dot at start. Fails if uniform width,
 * if filaments look messy, or if it looks like a filled polygon.
 */

import type {
  StrokeOutline, StrokeProfile, Mark, MarkConfig, MarkStrategy, Point2D,
} from "../types.js";
import { tangent, normalLeft } from "../util/vec.js";
import { cumulativeArcLengths } from "../util/arc-length.js";

export const brushMark: MarkStrategy = {
  id: "brush",
  name: "Brush / Sumi-e",

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

    // 1. Main filled stroke — use the full outline but at lower opacity
    // so the filaments in the trailing section contrast against it.
    {
      const poly: Point2D[] = [];
      for (const p of outline.startCap) poly.push(p);
      for (const p of outline.left) poly.push(p);
      for (const p of outline.endCap) poly.push(p);
      for (let i = outline.right.length - 1; i >= 0; i--) poly.push(outline.right[i]!);
      if (poly.length >= 3) {
        marks.push({
          points: poly,
          width: 0, // filled polygon
          opacity: 0.4 + rng() * 0.1,
        });
      }
    }

    // 2. Wet reinforcement — thicker centerline in first 35%
    {
      const wetEnd = Math.floor(points.length * 0.35);
      if (wetEnd > 1) {
        const wetPts: Point2D[] = [];
        for (let i = 0; i <= wetEnd; i++) {
          const pt = points[i]!;
          let wx = 0, wy = 0;
          if (i > 0 && i < points.length - 1) {
            const tan = tangent(points[i - 1]!, points[i + 1]!);
            const n = normalLeft(tan);
            wx = n.x * (rng() - 0.5) * config.weight * 0.04;
            wy = n.y * (rng() - 0.5) * config.weight * 0.04;
          }
          wetPts.push({ x: pt.x + wx, y: pt.y + wy });
        }
        const midW = points[Math.floor(wetEnd / 2)]!.width * 1.6;
        marks.push({
          points: wetPts,
          width: Math.min(midW, config.weight * 1.1),
          opacity: 0.3 + rng() * 0.1,
        });
      }
    }

    // 3. Dry-brush filaments — 3-5 thin parallel lines in the trailing
    // portion (last ~45%) where the brush runs dry. Each filament follows
    // the centerline with a perpendicular offset. They stay within the
    // stroke footprint — the profile's natural taper provides the
    // thick→thin transition.
    const filamentCount = Math.max(3, Math.floor(config.density * 3) + 2);
    const dryStart = 0.55;

    for (let f = 0; f < filamentCount; f++) {
      const normalizedF = (f - (filamentCount - 1) / 2) / ((filamentCount - 1) / 2 || 1);
      const filamentPts: Point2D[] = [];

      for (let i = 0; i < points.length; i++) {
        const t = totalLength > 0 ? cumLengths[i]! / totalLength : 0;
        if (t < dryStart) continue;

        const pt = points[i]!;
        const dryT = Math.min(1, (t - dryStart) / (1 - dryStart));

        // Filaments spread wider as the brush lifts, proportional to
        // the stroke width at this point (so they stay within the outline)
        const spread = pt.width * (0.35 + 0.5 * dryT);

        let ox = 0, oy = 0;
        if (i > 0 && i < points.length - 1) {
          const tan = tangent(points[i - 1]!, points[i + 1]!);
          const n = normalLeft(tan);
          ox = n.x * normalizedF * spread;
          oy = n.y * normalizedF * spread;
        }

        // Probabilistic gaps in the last 20% (bristles separating)
        if (t > 0.8 && rng() < 0.15 * config.jitter) {
          if (filamentPts.length >= 2) {
            marks.push({
              points: [...filamentPts],
              width: config.weight * 0.15,
              opacity: 0.55 + rng() * 0.25,
            });
          }
          filamentPts.length = 0;
          continue;
        }

        filamentPts.push({ x: pt.x + ox, y: pt.y + oy });
      }

      if (filamentPts.length >= 2) {
        marks.push({
          points: filamentPts,
          width: config.weight * 0.15,
          opacity: 0.55 + rng() * 0.25,
        });
      }
    }

    // 4. Wet pooling — single darker dot at the start where ink pools
    if (config.density > 0.2 && totalLength > 5) {
      marks.push({
        points: [{ x: points[0]!.x, y: points[0]!.y }],
        width: points[0]!.width * 1.6,
        opacity: 0.5 + rng() * 0.2,
      });
    }

    return marks;
  },
};
