/**
 * Engraving mark strategy — fine contour outline + parallel hatching.
 *
 * Quality Bar 14: Clean thin contour outline. Interior filled with
 * parallel lines at consistent angle. Line spacing varies smoothly with
 * shading value (tight = dark, loose = light). Lines clip cleanly at
 * boundary. Reads as a copper-plate engraving.
 *
 * Based on engraving patterns from plugin-plants: single tapered contour,
 * primary perpendicular hatching with depth-based density, secondary
 * diagonal cross-hatching for deeper segments.
 */

import type {
  StrokeOutline, StrokeProfile, Mark, MarkConfig, MarkStrategy, Point2D,
} from "../types.js";
import { tangent, normalLeft, dist } from "../util/vec.js";
import { cumulativeArcLengths } from "../util/arc-length.js";
import { pointInPolygon } from "../util/polygon.js";

export const engravingMark: MarkStrategy = {
  id: "engraving",
  name: "Engraving",

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
    const lineWeight = config.weight * 0.3; // fine engraving lines

    // 1. Contour outline — trace both edges of the stroke outline
    const contourWeight = config.weight * 0.25;

    if (outline.left.length >= 2) {
      marks.push({
        points: outline.left.map(p => ({ x: p.x, y: p.y })),
        width: contourWeight,
        opacity: 1,
      });
    }

    if (outline.right.length >= 2) {
      marks.push({
        points: outline.right.map(p => ({ x: p.x, y: p.y })),
        width: contourWeight,
        opacity: 1,
      });
    }

    // Cap outlines
    if (outline.startCap.length >= 2) {
      marks.push({
        points: outline.startCap.map(p => ({ x: p.x, y: p.y })),
        width: contourWeight,
        opacity: 1,
      });
    }
    if (outline.endCap.length >= 2) {
      marks.push({
        points: outline.endCap.map(p => ({ x: p.x, y: p.y })),
        width: contourWeight,
        opacity: 1,
      });
    }

    // 2. Interior hatching — parallel lines perpendicular to stroke direction
    // Build the full outline polygon for clipping
    const polygon = buildOutlinePolygon(outline);
    if (polygon.length < 3 || totalLength < 5) return marks;

    const avgDepth = points.reduce((sum, p) => sum + (p.depth ?? 0), 0) / points.length;
    const hatchDensity = Math.min(1, avgDepth * 0.2 + 0.2) * config.density;
    const hatchAngle = config.angle ?? 0;

    // Spacing: denser = closer lines, sparser = further apart
    const spacing = Math.max(1, 3 * (1 - hatchDensity));
    const hatchCount = Math.max(1, Math.floor(totalLength / spacing));

    for (let h = 0; h < hatchCount; h++) {
      // Skip some hatches based on density (probabilistic thinning)
      if (rng() > hatchDensity + 0.3) continue;

      const t = (h + rng() * 0.3) / hatchCount;
      const idx = Math.min(Math.floor(t * (points.length - 1)), points.length - 2);
      const pt = points[idx]!;
      const nextPt = points[idx + 1]!;

      // Hatch direction: perpendicular to local stroke direction
      const tan = tangent(pt, nextPt);
      const n = normalLeft(tan);

      // Width at this point (for hatch length)
      const w = pt.width;
      const hatchHalfLen = w * 1.2;

      // Center of hatch (slight jitter along stroke)
      const cx = pt.x + (rng() - 0.5) * spacing * 0.3;
      const cy = pt.y + (rng() - 0.5) * spacing * 0.3;

      // Hatch endpoints
      const p0: Point2D = {
        x: cx - n.x * hatchHalfLen,
        y: cy - n.y * hatchHalfLen,
      };
      const p1: Point2D = {
        x: cx + n.x * hatchHalfLen,
        y: cy + n.y * hatchHalfLen,
      };

      // Clip to outline polygon — only draw if both endpoints are inside,
      // or trim to polygon boundary
      const p0In = pointInPolygon(p0, polygon);
      const p1In = pointInPolygon(p1, polygon);

      if (p0In && p1In) {
        marks.push({
          points: [p0, p1],
          width: lineWeight,
          opacity: 1,
        });
      } else if (p0In || p1In) {
        // One endpoint inside — clip to boundary
        const clipped = clipLineToPolygon(p0, p1, polygon);
        if (clipped && dist(clipped[0], clipped[1]) > 0.5) {
          marks.push({
            points: [clipped[0], clipped[1]],
            width: lineWeight,
            opacity: 1,
          });
        }
      }
    }

    // 3. Secondary cross-hatching for deeper segments
    if (avgDepth >= 2 && config.density > 0.3) {
      const crossAngle = Math.PI * 0.3; // ~54° offset
      const crossCount = Math.floor(hatchCount * 0.5);

      for (let h = 0; h < crossCount; h++) {
        if (rng() > hatchDensity + 0.1) continue;

        const t = (h + rng() * 0.3) / crossCount;
        const idx = Math.min(Math.floor(t * (points.length - 1)), points.length - 2);
        const pt = points[idx]!;
        const nextPt = points[idx + 1]!;
        const tan = tangent(pt, nextPt);
        const n = normalLeft(tan);

        // Rotate normal by crossAngle
        const cos = Math.cos(crossAngle);
        const sin = Math.sin(crossAngle);
        const rn: Point2D = {
          x: cos * n.x - sin * n.y,
          y: sin * n.x + cos * n.y,
        };

        const w = pt.width;
        const hatchHalfLen = w * 0.9;
        const cx = pt.x + (rng() - 0.5) * spacing * 0.3;
        const cy = pt.y + (rng() - 0.5) * spacing * 0.3;

        const p0: Point2D = { x: cx - rn.x * hatchHalfLen, y: cy - rn.y * hatchHalfLen };
        const p1: Point2D = { x: cx + rn.x * hatchHalfLen, y: cy + rn.y * hatchHalfLen };

        if (pointInPolygon(p0, polygon) && pointInPolygon(p1, polygon)) {
          marks.push({
            points: [p0, p1],
            width: lineWeight * 0.8,
            opacity: 0.9,
          });
        }
      }
    }

    return marks;
  },
};

/** Build a closed polygon from StrokeOutline edges and caps. */
function buildOutlinePolygon(outline: StrokeOutline): Point2D[] {
  const poly: Point2D[] = [];
  for (const p of outline.startCap) poly.push(p);
  for (const p of outline.left) poly.push(p);
  for (const p of outline.endCap) poly.push(p);
  for (let i = outline.right.length - 1; i >= 0; i--) poly.push(outline.right[i]!);
  return poly;
}

/** Clip a line segment to a polygon, returning the visible segment. */
function clipLineToPolygon(
  a: Point2D, b: Point2D, polygon: readonly Point2D[],
): [Point2D, Point2D] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let tMin = 0;
  let tMax = 1;
  const n = polygon.length;

  // Find intersections with polygon edges
  const intersections: number[] = [];
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const ex = pi.x - pj.x;
    const ey = pi.y - pj.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-10) continue;
    const dpx = pj.x - a.x;
    const dpy = pj.y - a.y;
    const t = (dpx * ey - dpy * ex) / denom;
    const u = (dpx * dy - dpy * dx) / denom;
    if (u >= 0 && u <= 1 && t >= 0 && t <= 1) {
      intersections.push(t);
    }
  }

  if (intersections.length === 0) return null;
  intersections.sort((a, b) => a - b);

  // Use the segment between first intersection and the inside endpoint
  const aIn = pointInPolygon(a, polygon);
  const t = intersections[0]!;
  const clippedPt: Point2D = { x: a.x + dx * t, y: a.y + dy * t };

  if (aIn) {
    return [a, clippedPt];
  } else {
    return [clippedPt, b];
  }
}
