/**
 * Brush / sumi-e mark strategy — wide strokes with wet/dry variation.
 *
 * Quality Bar 16: Wide stroke with visible thick→thin transition.
 * Dry-brush texture at fast sections (stroke breaks up into parallel
 * filaments). Wet pooling at slow sections (endpoints, direction changes).
 * Leaf is a single gestural stroke. Fails if uniform width or looks
 * like a filled polygon.
 *
 * Based on sumi-e patterns from plugin-plants: pressure-like tapering
 * (1.2× start → 0.3× end), edge wobble, ink pooling dots, selective
 * restraint (skip fine branches).
 */

import type {
  StrokeOutline, StrokeProfile, Mark, MarkConfig, MarkStrategy, Point2D,
} from "../types.js";
import { tangent, normalLeft, dist } from "../util/vec.js";
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

    // 1. Main brush stroke — rendered as the filled outline polygon plus
    // edge wobble marks for bristle texture. The outline provides the
    // thick→thin taper via the profile's per-point width.
    const startW = config.weight * 1.4;
    const endW = config.weight * 0.25;

    // Build the main filled stroke from the outline (already passed in)
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
          opacity: 0.55 + rng() * 0.15,
        });
      }
    }

    // Edge wobble marks — short strokes along both edges for bristle texture
    const wobbleCount = Math.max(3, Math.floor(points.length / 8));
    for (let w = 0; w < wobbleCount; w++) {
      const edgePts = rng() > 0.5 ? outline.left : outline.right;
      if (edgePts.length < 4) continue;
      const startIdx = Math.floor(rng() * (edgePts.length - 3));
      const len = 2 + Math.floor(rng() * 3);
      const endIdx = Math.min(startIdx + len, edgePts.length - 1);
      const wobblePts: Point2D[] = [];
      for (let i = startIdx; i <= endIdx; i++) {
        const p = edgePts[i]!;
        wobblePts.push({
          x: p.x + (rng() - 0.5) * 2,
          y: p.y + (rng() - 0.5) * 2,
        });
      }
      if (wobblePts.length >= 2) {
        marks.push({
          points: wobblePts,
          width: config.weight * 0.15,
          opacity: 0.3 + rng() * 0.3,
        });
      }
    }

    // 2. Dry-brush filaments — at fast/thin sections, the stroke breaks
    // into parallel lines (bristle marks visible).
    // 5-8 filaments spread across the stroke width for visible breakup.
    const filamentCount = Math.floor(config.density * 5) + 3;

    for (let f = 0; f < filamentCount; f++) {
      const filamentPoints: Point2D[] = [];
      // Spread filaments across the full stroke width
      const normalizedF = (f - (filamentCount - 1) / 2) / ((filamentCount - 1) / 2 || 1);
      const baseOffset = normalizedF * config.weight * 0.6;

      for (let i = 0; i < points.length; i++) {
        const pt = points[i]!;
        const t = totalLength > 0 ? cumLengths[i]! / totalLength : 0;

        // Dry-brush effect: filaments begin around t=0.3, fully separated by t=0.6
        if (t < 0.3) continue;
        const dryness = Math.min(1, (t - 0.3) / 0.3);

        // Probabilistic gaps — brush bristles separate more as stroke dries
        if (rng() < 0.2 * config.jitter * dryness) {
          if (filamentPoints.length >= 2) {
            marks.push({
              points: [...filamentPoints],
              width: config.weight * 0.25,
              opacity: 0.4 + rng() * 0.35,
            });
          }
          filamentPoints.length = 0;
          continue;
        }

        let ox = 0;
        let oy = 0;
        if (i > 0 && i < points.length - 1) {
          const tan = tangent(points[i - 1]!, points[i + 1]!);
          const n = normalLeft(tan);
          // Filament offset increases with dryness and adds per-filament jitter
          const jitteredOffset = baseOffset * (0.8 + 0.4 * dryness)
            + n.x * config.weight * 0.1 * (rng() - 0.5);
          ox = n.x * jitteredOffset;
          oy = n.y * jitteredOffset;
        }

        filamentPoints.push({ x: pt.x + ox, y: pt.y + oy });
      }

      if (filamentPoints.length >= 2) {
        marks.push({
          points: filamentPoints,
          width: config.weight * 0.25,
          opacity: 0.4 + rng() * 0.35,
        });
      }
    }

    // 3. Wet pooling — darker spots at endpoints and direction changes
    if (config.density > 0.2 && totalLength > 5) {
      // Start pooling (ink loaded here)
      marks.push({
        points: [{ x: points[0]!.x, y: points[0]!.y }],
        width: startW * 0.8,
        opacity: 0.5 + rng() * 0.3,
      });

      // End pooling (if brush rests)
      if (rng() < 0.5) {
        const lastPt = points[points.length - 1]!;
        marks.push({
          points: [{ x: lastPt.x, y: lastPt.y }],
          width: endW * 1.5,
          opacity: 0.3 + rng() * 0.3,
        });
      }

      // Direction-change pooling (ink gathers where brush slows)
      for (let i = 2; i < points.length - 2; i++) {
        const prev = tangent(points[i - 1]!, points[i]!);
        const next = tangent(points[i]!, points[i + 1]!);
        const dotProd = prev.x * next.x + prev.y * next.y;

        // Sharp direction change = brush slows = ink pools
        if (dotProd < 0.7 && rng() < 0.6) {
          marks.push({
            points: [{ x: points[i]!.x, y: points[i]!.y }],
            width: points[i]!.width * 0.6,
            opacity: 0.4 + rng() * 0.2,
          });
        }
      }
    }

    return marks;
  },
};
