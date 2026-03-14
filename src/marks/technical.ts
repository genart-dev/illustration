/**
 * Technical mark strategy — perfectly uniform weight, no variation.
 *
 * Produces marks that read as CAD/architectural drawing. This is the
 * "precise" baseline that other strategies depart from. Quality Bar 17:
 * any width variation, jitter, or artistic character is a failure.
 */

import type { StrokeOutline, StrokeProfile, Mark, MarkConfig, MarkStrategy } from "../types.js";

export const technicalMark: MarkStrategy = {
  id: "technical",
  name: "Technical Line",

  generateMarks(
    outline: StrokeOutline,
    profile: StrokeProfile,
    config: MarkConfig,
    _rng: () => number,
  ): Mark[] {
    const { points } = profile;
    if (points.length < 2) return [];

    // Single clean polyline following the centerline at uniform weight.
    // No jitter, no variation — config.jitter and rng are ignored.
    return [{
      points: points.map(p => ({ x: p.x, y: p.y })),
      width: config.weight,
      opacity: 1,
    }];
  },
};
