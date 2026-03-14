/**
 * Stroke outline generation — the keystone primitive.
 *
 * Takes a StrokeProfile (centerline polyline with per-point width) and
 * produces a StrokeOutline (closed polygon with separate left/right edges
 * and end caps).
 *
 * This replaces the per-segment approach in plugin-plants' drawOrganicBranch
 * and the lineWidth-based rendering used everywhere else.
 *
 * Algorithm:
 * 1. Compute cumulative arc lengths for taper evaluation
 * 2. At each vertex, compute averaged tangent and left/right normals
 * 3. Offset left/right by width * taperScale along the normal
 * 4. Handle acute angles with miter limiting (bevel if angle too sharp)
 * 5. Generate end caps based on CapStyle
 * 6. Return StrokeOutline with separate left/right/cap arrays
 */

import type { StrokeProfile, StrokeOutline, StrokePoint, Point2D, CapStyle } from "../types.js";
import { tangent, normalLeft, normalRight, add, scale, dot, averageTangent } from "../util/vec.js";
import { cumulativeArcLengths } from "../util/arc-length.js";
import { taperScale } from "./taper.js";
import { generateCap } from "./cap.js";

/** Maximum miter scale before beveling. Prevents spikes at acute angles. */
const MITER_LIMIT = 3;

/**
 * Generate a stroke outline from a stroke profile.
 *
 * @param profile Stroke centerline with per-point width.
 * @returns StrokeOutline with separate left, right, startCap, and endCap arrays.
 *          Returns null if the profile has fewer than 2 points.
 */
export function generateStrokeOutline(profile: StrokeProfile): StrokeOutline | null {
  const { points, taper, cap: capStyle = "round" } = profile;
  if (points.length < 2) return null;

  const cumLengths = cumulativeArcLengths(points);
  const totalLength = cumLengths[cumLengths.length - 1]!;

  const left: Point2D[] = [];
  const right: Point2D[] = [];

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!;
    const dist = cumLengths[i]!;

    // Width at this point, modulated by taper
    const tScale = taperScale(dist, totalLength, taper);
    const w = Math.max(0, pt.width * tScale);

    // Compute tangent at this vertex
    const tan = computeTangent(points, i);

    // Left and right normals
    const nL = normalLeft(tan);
    const nR = normalRight(tan);

    // Miter adjustment: at sharp bends, the naive normal offset produces spikes.
    // Compute the miter scale and clamp it.
    const miterScale = computeMiterScale(points, i, nL);

    const effectiveW = w * Math.min(miterScale, MITER_LIMIT);

    left.push(add(pt, scale(nL, effectiveW)));
    right.push(add(pt, scale(nR, effectiveW)));
  }

  // End caps
  const firstPt = points[0]!;
  const lastPt = points[points.length - 1]!;
  const startTan = tangent(points[1]!, points[0]!); // points backward
  const endTan = tangent(points[points.length - 2]!, lastPt); // points forward

  const firstW = points[0]!.width * taperScale(0, totalLength, taper);
  const lastW = lastPt.width * taperScale(totalLength, totalLength, taper);

  const startCap = generateCap(
    firstPt, startTan,
    right[0]!, left[0]!, // note: start cap goes right→left (backward)
    Math.max(0, firstW),
    capStyle,
  );

  const endCap = generateCap(
    lastPt, endTan,
    left[left.length - 1]!, right[right.length - 1]!,
    Math.max(0, lastW),
    capStyle,
  );

  return { left, right, startCap, endCap };
}

/**
 * Compute the unit tangent at vertex i of a polyline.
 * At endpoints, uses the single adjacent edge. At interior vertices,
 * averages the two adjacent edge tangents.
 */
function computeTangent(points: readonly StrokePoint[], i: number): Point2D {
  if (i === 0) {
    return tangent(points[0]!, points[1]!);
  }
  if (i === points.length - 1) {
    return tangent(points[i - 1]!, points[i]!);
  }
  return averageTangent(points[i - 1]!, points[i]!, points[i + 1]!);
}

/**
 * Compute miter scale at an interior vertex.
 *
 * When two edges meet at an angle, the perpendicular offset point is
 * farther from the vertex than the requested width. The miter scale
 * is 1 / cos(half_angle). We clamp this to MITER_LIMIT to prevent
 * spikes at acute angles.
 *
 * At endpoints, returns 1 (no miter adjustment).
 */
function computeMiterScale(
  points: readonly StrokePoint[],
  i: number,
  normal: Point2D,
): number {
  if (i === 0 || i === points.length - 1) return 1;

  // Edge tangents
  const t1 = tangent(points[i - 1]!, points[i]!);
  const n1 = normalLeft(t1);

  // Dot product of averaged normal with edge normal gives cos(half-angle)
  const d = dot(normal, n1);
  if (Math.abs(d) < 0.01) return MITER_LIMIT; // near-parallel: clamp
  return 1 / Math.abs(d);
}

/**
 * Convenience: generate outline and flatten to a single closed polygon.
 * Useful when you just need a filled shape.
 */
export function generateStrokePolygon(profile: StrokeProfile): Point2D[] | null {
  const outline = generateStrokeOutline(profile);
  if (!outline) return null;

  const result: Point2D[] = [];
  // Start cap (going from right[0] → left[0])
  for (const p of outline.startCap) result.push(p);
  // Left edge (forward)
  for (const p of outline.left) result.push(p);
  // End cap (going from left[end] → right[end])
  for (const p of outline.endCap) result.push(p);
  // Right edge (backward)
  for (let i = outline.right.length - 1; i >= 0; i--) result.push(outline.right[i]!);

  return result;
}
