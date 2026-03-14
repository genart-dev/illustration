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
 * Fewer points for thin strokes, more for thick.
 */
function generateRoundCap(
  center: Point2D,
  tangentDir: Point2D,
  leftPt: Point2D,
  _rightPt: Point2D,
  width: number,
): Point2D[] {
  const segments = Math.max(3, Math.min(12, Math.ceil(width * 0.5)));
  const normal = normalLeft(tangentDir);
  const result: Point2D[] = [];

  for (let i = 1; i < segments; i++) {
    const angle = (i / segments) * Math.PI;
    // Rotate from left normal through forward to right normal
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // In the cap's local frame: normal is "left", tangentDir is "forward"
    const x = center.x + width * (-normal.x * cos + tangentDir.x * sin);
    const y = center.y + width * (-normal.y * cos + tangentDir.y * sin);
    result.push({ x, y });
  }

  return result;
}
