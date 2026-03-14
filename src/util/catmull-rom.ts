/**
 * Centripetal Catmull-Rom spline interpolation.
 *
 * Produces smooth curves through a set of control points with no
 * cusps or self-intersections (unlike uniform Catmull-Rom).
 *
 * Generalized from plugin-painting/brush/path-utils.ts.
 */

import type { Point2D } from "../types.js";

/**
 * Interpolate a polyline using centripetal Catmull-Rom splines.
 *
 * @param points Input control points (at least 2).
 * @param segmentsPerSpan Number of interpolated points per span. Default: 8.
 * @param alpha Catmull-Rom alpha. 0 = uniform, 0.5 = centripetal (default), 1 = chordal.
 * @returns Smoothed polyline including the original endpoints.
 */
export function interpolateCatmullRom(
  points: readonly Point2D[],
  segmentsPerSpan = 8,
  alpha = 0.5,
): Point2D[] {
  if (points.length < 2) return points.slice();
  if (points.length === 2) {
    return linearSubdivide(points[0]!, points[1]!, segmentsPerSpan);
  }

  const result: Point2D[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    // Four control points: P0, P1, P2, P3
    // Clamp at boundaries by repeating endpoints
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;

    // Knot intervals based on centripetal parameterization
    const t0 = 0;
    const t1 = t0 + Math.pow(distSq(p0, p1), alpha * 0.5);
    const t2 = t1 + Math.pow(distSq(p1, p2), alpha * 0.5);
    const t3 = t2 + Math.pow(distSq(p2, p3), alpha * 0.5);

    const steps = i === points.length - 2 ? segmentsPerSpan + 1 : segmentsPerSpan;
    for (let j = 0; j < steps; j++) {
      const t = t1 + (t2 - t1) * (j / segmentsPerSpan);
      const pt = evalCatmullRom(p0, p1, p2, p3, t0, t1, t2, t3, t);
      result.push(pt);
    }
  }

  return result;
}

function evalCatmullRom(
  p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D,
  t0: number, t1: number, t2: number, t3: number,
  t: number,
): Point2D {
  const a1 = lerpT(p0, p1, t0, t1, t);
  const a2 = lerpT(p1, p2, t1, t2, t);
  const a3 = lerpT(p2, p3, t2, t3, t);
  const b1 = lerpT(a1, a2, t0, t2, t);
  const b2 = lerpT(a2, a3, t1, t3, t);
  return lerpT(b1, b2, t1, t2, t);
}

function lerpT(a: Point2D, b: Point2D, ta: number, tb: number, t: number): Point2D {
  const denom = tb - ta;
  if (Math.abs(denom) < 1e-10) return a;
  const f = (t - ta) / denom;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function distSq(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

function linearSubdivide(a: Point2D, b: Point2D, steps: number): Point2D[] {
  const result: Point2D[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return result;
}
