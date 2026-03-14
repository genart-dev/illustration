/**
 * Stipple fill — dots placed within a polygon, density-modulated.
 */

import type { Point2D, Mark, FillConfig, FillStrategy } from "../types.js";
import { pointInPolygon, polygonBounds } from "../util/polygon.js";

export const stippleFill: FillStrategy = {
  id: "stipple",
  name: "Stipple",

  generateFill(
    region: readonly Point2D[],
    config: FillConfig,
    rng: () => number,
  ): Mark[] {
    const bounds = polygonBounds(region);
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const area = w * h;

    // Number of dots based on density and area
    const dotCount = Math.round(config.density * area * 0.1);
    const marks: Mark[] = [];

    for (let i = 0; i < dotCount; i++) {
      const x = bounds.minX + rng() * w;
      const y = bounds.minY + rng() * h;

      if (pointInPolygon({ x, y }, region)) {
        // A stipple dot is a tiny mark (single point or very short line)
        const jitter = config.jitter ?? 0;
        const jx = (rng() - 0.5) * jitter * 2;
        const jy = (rng() - 0.5) * jitter * 2;
        marks.push({
          points: [{ x: x + jx, y: y + jy }],
          width: config.weight * (0.5 + rng() * 0.5),
          opacity: 0.6 + rng() * 0.4,
        });
      }
    }

    return marks;
  },
};
