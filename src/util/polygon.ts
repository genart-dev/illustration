/**
 * Polygon utilities — point-in-polygon, area, winding, and offset.
 *
 * Generalized from plugin-painting/fill/region-utils.ts.
 */

import type { Point2D, Bounds } from "../types.js";

/**
 * Test if a point is inside a closed polygon (ray-casting algorithm).
 */
export function pointInPolygon(point: Point2D, polygon: readonly Point2D[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    if (
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Signed area of a polygon (positive = CCW, negative = CW). */
export function polygonArea(polygon: readonly Point2D[]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    area += (pj.x + pi.x) * (pj.y - pi.y);
  }
  return area * 0.5;
}

/** Axis-aligned bounding box of a polygon. */
export function polygonBounds(polygon: readonly Point2D[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Offset (inset/outset) a closed polygon by a distance.
 *
 * Uses vertex angle-bisector method. Positive distance = outset,
 * negative = inset. Returns null if the result is degenerate.
 *
 * Generalized from plugin-painting/fill/region-utils.ts offsetPolygon.
 */
export function offsetPolygon(
  polygon: readonly Point2D[],
  distance: number,
): Point2D[] | null {
  const n = polygon.length;
  if (n < 3) return null;

  // Determine winding: positive area = CCW, negative = CW
  // We want outward normals for positive distance, so flip sign for CW polygons
  const area = polygonArea(polygon);
  const sign = area >= 0 ? 1 : -1;
  const d = distance * sign;

  const result: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n]!;
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % n]!;

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (len1 < 1e-10 || len2 < 1e-10) continue;

    // Left-hand normals of each edge (rotate 90° CCW)
    const n1x = -dy1 / len1;
    const n1y = dx1 / len1;
    const n2x = -dy2 / len2;
    const n2y = dx2 / len2;

    // Bisector
    const bx = n1x + n2x;
    const by = n1y + n2y;
    const bLen = Math.sqrt(bx * bx + by * by);
    if (bLen < 1e-10) continue;

    // Scale factor: d / cos(half-angle between normals)
    const cosHalf = (bx * n1x + by * n1y) / bLen;
    const sc = cosHalf > 0.1 ? d / cosHalf : d * 4;

    result.push({
      x: curr.x + (bx / bLen) * sc,
      y: curr.y + (by / bLen) * sc,
    });
  }

  return result.length >= 3 ? result : null;
}

/**
 * Flatten a StrokeOutline into a single closed polygon.
 * Order: left → endCap → right(reversed) → startCap.
 */
export function flattenOutline(outline: {
  left: readonly Point2D[];
  right: readonly Point2D[];
  startCap: readonly Point2D[];
  endCap: readonly Point2D[];
}): Point2D[] {
  const result: Point2D[] = [];
  for (const p of outline.left) result.push(p);
  for (const p of outline.endCap) result.push(p);
  for (let i = outline.right.length - 1; i >= 0; i--) result.push(outline.right[i]!);
  for (const p of outline.startCap) result.push(p);
  return result;
}
