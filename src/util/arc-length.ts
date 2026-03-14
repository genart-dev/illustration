/**
 * Arc-length parameterization of polylines.
 *
 * Given a polyline, builds a lookup table that maps distance-along-path
 * to interpolated position. O(n) build, O(log n) lookup.
 *
 * Generalized from plugin-painting/brush/path-utils.ts.
 */

import type { Point2D } from "../types.js";
import { dist } from "./vec.js";

/** Arc-length lookup table. */
export interface ArcLengthTable {
  /** Total arc length of the polyline. */
  readonly totalLength: number;
  /** Sample a point at a given distance along the path. Clamps to [0, totalLength]. */
  sampleAt(distance: number): Point2D;
  /** Sample a point at normalized parameter t ∈ [0, 1]. */
  sampleAtT(t: number): Point2D;
}

/**
 * Build an arc-length parameterization table for a polyline.
 *
 * @param points Polyline vertices (at least 2).
 * @returns ArcLengthTable for distance-based and t-based sampling.
 */
export function buildArcLengthTable(points: readonly Point2D[]): ArcLengthTable {
  if (points.length < 2) {
    const p = points[0] ?? { x: 0, y: 0 };
    return {
      totalLength: 0,
      sampleAt: () => p,
      sampleAtT: () => p,
    };
  }

  // Cumulative distances at each vertex
  const cumDist: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumDist.push(cumDist[i - 1]! + dist(points[i - 1]!, points[i]!));
  }
  const totalLength = cumDist[cumDist.length - 1]!;

  function sampleAt(distance: number): Point2D {
    if (distance <= 0) return points[0]!;
    if (distance >= totalLength) return points[points.length - 1]!;

    // Binary search for the segment containing this distance
    let lo = 0;
    let hi = cumDist.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1;
      if (cumDist[mid]! <= distance) lo = mid;
      else hi = mid;
    }

    const segStart = cumDist[lo]!;
    const segEnd = cumDist[hi]!;
    const segLen = segEnd - segStart;
    const t = segLen > 0 ? (distance - segStart) / segLen : 0;

    const a = points[lo]!;
    const b = points[hi]!;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function sampleAtT(t: number): Point2D {
    return sampleAt(t * totalLength);
  }

  return { totalLength, sampleAt, sampleAtT };
}

/**
 * Compute cumulative arc lengths for each vertex of a polyline.
 * Returns an array of the same length as the input.
 */
export function cumulativeArcLengths(points: readonly Point2D[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    result.push(result[i - 1]! + dist(points[i - 1]!, points[i]!));
  }
  return result;
}
