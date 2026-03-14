/**
 * Parallel-line hatching fill strategy.
 *
 * Generates evenly-spaced parallel lines at a given angle, clipped to
 * a closed polygon region. Density controls line spacing; weight controls
 * line width.
 */

import type { Point2D, Mark, FillConfig, FillStrategy } from "../types.js";
import { polygonBounds } from "../util/polygon.js";

export const hatchFill: FillStrategy = {
  id: "hatch",
  name: "Parallel Hatch",

  generateFill(
    region: readonly Point2D[],
    config: FillConfig,
    rng: () => number,
  ): Mark[] {
    if (region.length < 3) return [];

    const bounds = polygonBounds(region);
    const spacing = Math.max(1, (1 - config.density) * 20 + 2);
    const angle = config.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Perpendicular direction (normal to hatch lines)
    const perpX = -sin;
    const perpY = cos;

    // Project all polygon vertices onto the perpendicular axis to find scan range
    let minProj = Infinity;
    let maxProj = -Infinity;
    for (const p of region) {
      const proj = p.x * perpX + p.y * perpY;
      if (proj < minProj) minProj = proj;
      if (proj > maxProj) maxProj = proj;
    }

    // Project extent along hatch direction for line length
    let minDir = Infinity;
    let maxDir = -Infinity;
    for (const p of region) {
      const proj = p.x * cos + p.y * sin;
      if (proj < minDir) minDir = proj;
      if (proj > maxDir) maxDir = proj;
    }
    const extend = (maxDir - minDir) * 0.1;

    const marks: Mark[] = [];

    // Scan across perpendicular axis
    for (let d = minProj; d <= maxProj; d += spacing) {
      // Origin of this scan line: a point at perpendicular offset d
      const ox = perpX * d;
      const oy = perpY * d;

      // Find intersections of this line with polygon edges
      const intersections = linePolygonIntersections(
        ox, oy, cos, sin, region,
      );

      // Draw segments between pairs
      for (let j = 0; j + 1 < intersections.length; j += 2) {
        const t0 = intersections[j]!;
        const t1 = intersections[j + 1]!;
        if (Math.abs(t1 - t0) < 0.5) continue; // skip degenerate
        marks.push({
          points: [
            { x: ox + cos * t0, y: oy + sin * t0 },
            { x: ox + cos * t1, y: oy + sin * t1 },
          ],
          width: config.weight,
          opacity: 1,
        });
      }
    }

    return marks;
  },
};

/**
 * Find intersections of a ray (origin + t * direction) with polygon edges.
 * Returns sorted t-values.
 */
function linePolygonIntersections(
  ox: number, oy: number,
  dx: number, dy: number,
  polygon: readonly Point2D[],
): number[] {
  const intersections: number[] = [];
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;

    // Edge vector
    const ex = pi.x - pj.x;
    const ey = pi.y - pj.y;

    // Solve: O + t*D = Pj + u*E
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-10) continue; // parallel

    const dpx = pj.x - ox;
    const dpy = pj.y - oy;

    const t = (dpx * ey - dpy * ex) / denom;
    const u = (dpx * dy - dpy * dx) / denom;

    if (u >= 0 && u <= 1) {
      intersections.push(t);
    }
  }

  intersections.sort((a, b) => a - b);
  return intersections;
}
