/**
 * Taper profile evaluation.
 *
 * Given a distance along a stroke and a TaperSpec, computes a scale factor
 * (0–1) to multiply the stroke width by. Handles start taper, end taper,
 * and different easing curves.
 */

import type { TaperSpec, TaperCurve } from "../types.js";

/**
 * Compute taper scale factor at a given distance along a stroke.
 *
 * @param distance Distance from the start of the stroke.
 * @param totalLength Total arc length of the stroke.
 * @param taper Taper specification. If undefined, returns 1 (no taper).
 * @returns Scale factor in [0, 1] to multiply width by.
 */
export function taperScale(
  distance: number,
  totalLength: number,
  taper: TaperSpec | undefined,
): number {
  if (!taper || totalLength <= 0) return 1;

  const curve = taper.curve ?? "linear";
  let scale = 1;

  // Start taper: 0 → 1 over taper.start length
  const startLen = taper.start ?? 0;
  if (startLen > 0 && distance < startLen) {
    scale *= applyEasing(distance / startLen, curve);
  }

  // End taper: 1 → 0 over taper.end length
  const endLen = taper.end ?? 0;
  if (endLen > 0) {
    const distFromEnd = totalLength - distance;
    if (distFromEnd < endLen) {
      scale *= applyEasing(distFromEnd / endLen, curve);
    }
  }

  return scale;
}

function applyEasing(t: number, curve: TaperCurve): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (curve) {
    case "ease-in":
      return clamped * clamped;
    case "ease-out":
      return 1 - (1 - clamped) * (1 - clamped);
    case "ease-in-out":
      return clamped < 0.5
        ? 2 * clamped * clamped
        : 1 - 2 * (1 - clamped) * (1 - clamped);
    case "linear":
    default:
      return clamped;
  }
}
