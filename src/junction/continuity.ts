/**
 * G1 continuity enforcement at join points.
 *
 * Ensures tangent continuity at junction boundaries between merged
 * branch outlines. When two outline polygons meet at a junction,
 * the tangent direction at the shared vertex should match — no
 * visible kink at the join.
 *
 * G0 = positional continuity (points match) — always satisfied
 * G1 = tangent continuity (directions match) — this module
 * G2 = curvature continuity (not implemented, rarely needed for illustration)
 */

import type { Point2D } from "../types.js";
import { tangent, normalize, add, sub, scale, dot, lerp, dist } from "../util/vec.js";

/**
 * Smooth a polyline at a specific index to enforce G1 continuity.
 *
 * Adjusts the point at `index` and optionally its neighbors so that
 * the tangent direction transitions smoothly. Uses Laplacian smoothing
 * weighted by edge lengths.
 *
 * @param points Mutable array of polygon points.
 * @param index Index of the point to smooth.
 * @param strength Smoothing strength (0 = no change, 1 = full Laplacian). Default: 0.5.
 * @param radius Number of neighboring points to also smooth. Default: 1.
 */
export function smoothAtIndex(
  points: Point2D[],
  index: number,
  strength = 0.5,
  radius = 1,
): void {
  const n = points.length;
  if (n < 3 || index < 0 || index >= n) return;

  // Apply Laplacian smoothing to the target and its neighbors
  const startIdx = Math.max(0, index - radius);
  const endIdx = Math.min(n - 1, index + radius);

  // Compute smoothed positions (don't apply until all computed)
  const smoothed = new Map<number, Point2D>();

  for (let i = startIdx; i <= endIdx; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;

    // Weight by distance from the target index
    const distFromTarget = Math.abs(i - index);
    const w = strength * Math.pow(0.5, distFromTarget);

    // Laplacian: midpoint of neighbors
    const mid = { x: (prev.x + next.x) * 0.5, y: (prev.y + next.y) * 0.5 };
    smoothed.set(i, lerp(curr, mid, w));
  }

  // Apply
  for (const [i, pt] of smoothed) {
    points[i] = pt;
  }
}

/**
 * Enforce G1 continuity along a closed polygon at specified indices.
 *
 * @param polygon Mutable array of polygon points.
 * @param junctionIndices Indices where junctions occur (crotch curve endpoints).
 * @param strength Smoothing strength. Default: 0.5.
 */
export function enforceG1AtJunctions(
  polygon: Point2D[],
  junctionIndices: number[],
  strength = 0.5,
): void {
  for (const idx of junctionIndices) {
    smoothAtIndex(polygon, idx, strength, 2);
  }
}

/**
 * Check if a polygon has G1 continuity at an index.
 *
 * Returns the tangent discontinuity angle in radians (0 = perfectly smooth).
 */
export function tangentDiscontinuity(
  polygon: readonly Point2D[],
  index: number,
): number {
  const n = polygon.length;
  if (n < 3) return 0;

  const prev = polygon[(index - 1 + n) % n]!;
  const curr = polygon[index]!;
  const next = polygon[(index + 1) % n]!;

  const t1 = tangent(prev, curr);
  const t2 = tangent(curr, next);

  // Angle between tangents
  const d = dot(t1, t2);
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

/**
 * Subdivide a polygon at sharp corners to improve smoothness.
 *
 * At points where the tangent changes by more than `maxAngle`, insert
 * midpoints on both adjacent edges to add geometry for smoother curves.
 *
 * @param polygon Input polygon.
 * @param maxAngle Maximum allowed tangent change (radians). Default: π/6 (30°).
 * @returns New polygon with inserted midpoints.
 */
export function subdivideSharpCorners(
  polygon: readonly Point2D[],
  maxAngle = Math.PI / 6,
): Point2D[] {
  const n = polygon.length;
  if (n < 3) return polygon.slice();

  const result: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const disc = tangentDiscontinuity(polygon, i);

    if (disc > maxAngle) {
      // Insert midpoint before and after this vertex
      const prev = polygon[(i - 1 + n) % n]!;
      const curr = polygon[i]!;
      const next = polygon[(i + 1) % n]!;

      result.push(lerp(prev, curr, 0.75));
      result.push(curr);
      result.push(lerp(curr, next, 0.25));
    } else {
      result.push(polygon[i]!);
    }
  }

  return result;
}
