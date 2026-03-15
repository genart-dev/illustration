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
    const baseSpacing = Math.max(1, (1 - config.density) * 20 + 2);
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

    // Gradient support: project region center and extents onto gradient axis
    let gradDirX = 0;
    let gradDirY = 0;
    let gradMin = 0;
    let gradRange = 0;
    const hasGradient = config.gradient && config.gradient.strength > 0;
    if (hasGradient) {
      gradDirX = Math.cos(config.gradient!.angle);
      gradDirY = Math.sin(config.gradient!.angle);
      let gMin = Infinity;
      let gMax = -Infinity;
      for (const p of region) {
        const proj = p.x * gradDirX + p.y * gradDirY;
        if (proj < gMin) gMin = proj;
        if (proj > gMax) gMax = proj;
      }
      gradMin = gMin;
      gradRange = gMax - gMin;
    }

    const marks: Mark[] = [];

    // Scan across perpendicular axis with variable step size
    let d = minProj;
    while (d <= maxProj) {
      // Origin of this scan line: a point at perpendicular offset d
      const ox = perpX * d;
      const oy = perpY * d;

      // Find intersections of this line with polygon edges
      const intersections = linePolygonIntersections(
        ox, oy, cos, sin, region,
      );

      // Compute local density factor from gradient
      let localDensityFactor = 1;
      if (hasGradient && gradRange > 0 && intersections.length >= 2) {
        // Project the scan line origin onto the gradient axis
        const gradProj = ox * gradDirX + oy * gradDirY;
        // Also include the midpoint contribution for non-perpendicular gradients
        const tMid = (intersections[0]! + intersections[1]!) / 2;
        const midX = ox + cos * tMid;
        const midY = oy + sin * tMid;
        const midProj = midX * gradDirX + midY * gradDirY;
        const gradT = Math.max(0, Math.min(1, (midProj - gradMin) / gradRange));
        // gradT=0 → sparse (wide spacing), gradT=1 → dense (tight spacing)
        // Scale from (1-strength) to (1+strength) so gradient can push ABOVE base density
        localDensityFactor = (1 - config.gradient!.strength) + config.gradient!.strength * gradT * 2;
      }

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

      // Advance by spacing — narrower spacing = denser lines in gradient direction
      const spacing = baseSpacing / Math.max(0.2, localDensityFactor);
      d += spacing;
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
