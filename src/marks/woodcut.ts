/**
 * Woodcut mark strategy — bold solid fill with carved gouge marks.
 *
 * Quality Bar 15: Bold solid fill with carved gouge marks (thin white
 * lines cut through the black). Gouges follow the branch direction.
 * Reads as a block print. Fails if gouges are too large (jack-o-lantern
 * effect) or randomly oriented instead of following branch direction.
 *
 * Approach: Generate the filled outline as a primary mark, then generate
 * narrow "gouge" marks that follow the stroke direction. Gouges are
 * rendered by consumers as negative/inverted marks (opacity < 0 signals
 * destination-out, or consumers render them in background color).
 */

import type {
  StrokeOutline, StrokeProfile, Mark, MarkConfig, MarkStrategy, Point2D,
} from "../types.js";
import { tangent, normalLeft, add, scale } from "../util/vec.js";
import { cumulativeArcLengths } from "../util/arc-length.js";

export const woodcutMark: MarkStrategy = {
  id: "woodcut",
  name: "Woodcut",

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

    // 1. Bold filled outline — the black mass
    const outlinePolygon = buildOutlinePolygon(outline);
    if (outlinePolygon.length >= 3) {
      marks.push({
        points: outlinePolygon,
        width: 0, // width=0 signals this is a filled polygon, not a stroke
        opacity: 1,
      });
    }

    // 2. Bold contour stroke for extra weight
    marks.push({
      points: points.map(p => ({ x: p.x, y: p.y })),
      width: config.weight * 3,
      opacity: 1,
    });

    // 3. Gouge marks — narrow lines following the branch direction
    // Only on thick enough strokes (avoid jack-o-lantern on thin branches)
    const avgWidth = points.reduce((sum, p) => sum + p.width, 0) / points.length;
    if (avgWidth < 4 || totalLength < 10) return marks;

    // Number of gouges proportional to width, not too many
    const gougeCount = Math.min(
      Math.floor(avgWidth / 3),
      Math.floor(totalLength * config.density * 0.08),
    );

    for (let g = 0; g < gougeCount; g++) {
      // Gouge runs along the stroke direction with some offset
      const offsetFrac = (g + 0.5) / gougeCount - 0.5; // -0.5 to +0.5
      const gougePoints: Point2D[] = [];

      // Start and end along the stroke (not full length — partial cuts)
      const startT = 0.1 + rng() * 0.3;
      const endT = 0.6 + rng() * 0.3;

      for (let i = 0; i < points.length; i++) {
        const t = totalLength > 0 ? cumLengths[i]! / totalLength : 0;
        if (t < startT || t > endT) continue;

        const pt = points[i]!;
        const w = pt.width;

        // Offset perpendicular to stroke direction
        let ox = 0;
        let oy = 0;
        if (i > 0 && i < points.length - 1) {
          const tan = tangent(points[i - 1]!, points[i + 1]!);
          const n = normalLeft(tan);
          const perpOffset = offsetFrac * w * 1.4;
          // Small random wobble for hand-carved feel
          const wobble = (rng() - 0.5) * w * 0.1;
          ox = n.x * (perpOffset + wobble);
          oy = n.y * (perpOffset + wobble);
        }

        gougePoints.push({ x: pt.x + ox, y: pt.y + oy });
      }

      if (gougePoints.length >= 2) {
        marks.push({
          points: gougePoints,
          width: config.weight * (0.3 + rng() * 0.2), // thin cuts
          opacity: -1, // negative opacity = gouge (inverted/erased mark)
        });
      }
    }

    return marks;
  },
};

function buildOutlinePolygon(outline: StrokeOutline): Point2D[] {
  const poly: Point2D[] = [];
  for (const p of outline.startCap) poly.push(p);
  for (const p of outline.left) poly.push(p);
  for (const p of outline.endCap) poly.push(p);
  for (let i = outline.right.length - 1; i >= 0; i--) poly.push(outline.right[i]!);
  return poly;
}
