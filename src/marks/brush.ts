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

    // 1. Main brush stroke — wide, with thick→thin taper
    // Width envelope: swell at start (loading), taper to thin at end (lift)
    const mainPoints: Point2D[] = [];

    for (let i = 0; i < points.length; i++) {
      const pt = points[i]!;
      const t = totalLength > 0 ? cumLengths[i]! / totalLength : 0;

      // Edge wobble for brush bristle texture
      let wx = 0;
      let wy = 0;
      if (i > 0 && i < points.length - 1) {
        const tan = tangent(points[i - 1]!, points[i + 1]!);
        const n = normalLeft(tan);
        const wobble = pt.width * 0.08 * (rng() - 0.5);
        wx = n.x * wobble;
        wy = n.y * wobble;
      }

      mainPoints.push({ x: pt.x + wx, y: pt.y + wy });
    }

    // Width varies dramatically: thick at start, thin at end
    const startW = config.weight * 1.2;
    const endW = config.weight * 0.3;
    const avgW = (startW + endW) / 2;

    marks.push({
      points: mainPoints,
      width: avgW,
      opacity: 0.75 + rng() * 0.2,
    });

    // 2. Dry-brush filaments — at fast/thin sections, the stroke breaks
    // into parallel lines (bristle marks visible)
    const filamentCount = Math.floor(config.density * 3) + 1;

    for (let f = 0; f < filamentCount; f++) {
      const filamentPoints: Point2D[] = [];
      const filamentOffset = (f - (filamentCount - 1) / 2) * config.weight * 0.3;
      let hasGap = false;

      for (let i = 0; i < points.length; i++) {
        const pt = points[i]!;
        const t = totalLength > 0 ? cumLengths[i]! / totalLength : 0;

        // Dry-brush effect: filaments only appear in the second half
        // where the brush is running dry
        if (t < 0.4) continue;

        // Probabilistic gaps — brush bristles separate
        if (rng() < 0.15 * config.jitter) {
          if (filamentPoints.length >= 2) {
            marks.push({
              points: [...filamentPoints],
              width: config.weight * 0.15,
              opacity: 0.3 + rng() * 0.3,
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
          ox = n.x * filamentOffset;
          oy = n.y * filamentOffset;
        }

        filamentPoints.push({ x: pt.x + ox, y: pt.y + oy });
      }

      if (filamentPoints.length >= 2) {
        marks.push({
          points: filamentPoints,
          width: config.weight * 0.15,
          opacity: 0.3 + rng() * 0.3,
        });
      }
    }

    // 3. Wet pooling — darker spots at endpoints and direction changes
    if (config.density > 0.2 && totalLength > 5) {
      // Start pooling (ink loaded here)
      const startPt = mainPoints[0]!;
      marks.push({
        points: [startPt],
        width: startW * 0.8,
        opacity: 0.5 + rng() * 0.3,
      });

      // End pooling (if brush rests)
      if (rng() < 0.5) {
        const endPt = mainPoints[mainPoints.length - 1]!;
        marks.push({
          points: [endPt],
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
