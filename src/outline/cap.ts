/**
 * End cap generation for stroke outlines.
 *
 * Produces the geometry that closes the start/end of a stroke outline.
 * Three styles: round (semicircle), flat (perpendicular line), pointed
 * (extend edges to intersection).
 */

import type { Point2D, CapStyle } from "../types.js";
import { normalLeft, scale, add } from "../util/vec.js";

/**
 * Generate cap points connecting the left and right edge endpoints.
 *
 * @param center The centerline endpoint.
 * @param tangentDir Unit tangent at the endpoint (pointing "outward" from the stroke).
 * @param leftPt Left edge endpoint.
 * @param rightPt Right edge endpoint.
 * @param width Half-width at this endpoint.
 * @param style Cap style.
 * @returns Array of points from left → right (for end cap) or right → left (for start cap).
 */
export function generateCap(
  center: Point2D,
  tangentDir: Point2D,
  leftPt: Point2D,
  rightPt: Point2D,
  width: number,
  style: CapStyle,
): Point2D[] {
  switch (style) {
    case "flat":
      return [];

    case "pointed":
      return [add(center, scale(tangentDir, width * 0.8))];

    case "round":
    default:
      return generateRoundCap(center, tangentDir, leftPt, rightPt, width);
  }
}

/**
 * Generate a semicircular cap with adaptive subdivision.
 * Uses actual left/right points to compute the arc, not center+tangent,
 * so caps are correct even when miter adjustment shifts edge points.
 */
function generateRoundCap(
  center: Point2D,
  _tangentDir: Point2D,
  leftPt: Point2D,
  rightPt: Point2D,
  width: number,
): Point2D[] {
  // Compute the midpoint and radius from actual edge points
  const midX = (leftPt.x + rightPt.x) / 2;
  const midY = (leftPt.y + rightPt.y) / 2;

  // Direction from left to right (the chord)
  const chordX = rightPt.x - leftPt.x;
  const chordY = rightPt.y - leftPt.y;
  const chordLen = Math.sqrt(chordX * chordX + chordY * chordY);
  if (chordLen < 0.01) return [];

  // Normal to chord (outward from stroke) — cross with tangent to pick correct side
  // Use the actual center-to-midpoint offset to determine "outward"
  const perpX = -chordY / chordLen;
  const perpY = chordX / chordLen;

  // Determine outward direction: the cap should bulge away from the stroke body
  // Use center→midpoint to check; if center is roughly at midpoint, use tangent
  const cmX = midX - center.x;
  const cmY = midY - center.y;
  const cmLen = Math.sqrt(cmX * cmX + cmY * cmY);

  // The "outward" perpendicular should point in the tangent direction (away from stroke)
  // Determine sign by dot product with tangent
  const dotWithTangent = perpX * _tangentDir.x + perpY * _tangentDir.y;
  const sign = dotWithTangent >= 0 ? 1 : -1;
  const outX = perpX * sign;
  const outY = perpY * sign;

  const radius = chordLen / 2;
  const segments = Math.max(4, Math.min(12, Math.ceil(radius * 0.8)));
  const result: Point2D[] = [];

  // Generate arc from leftPt through outward semicircle to rightPt
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const angle = t * Math.PI;
    // Interpolate along chord + outward arc
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // At angle 0: at leftPt, at PI: at rightPt
    // chord direction: left→right, perp: outward
    const chordNormX = chordX / chordLen;
    const chordNormY = chordY / chordLen;
    const x = midX - radius * cos * chordNormX + radius * sin * outX;
    const y = midY - radius * cos * chordNormY + radius * sin * outY;
    result.push({ x, y });
  }

  return result;
}
