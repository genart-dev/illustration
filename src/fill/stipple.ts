/**
 * Stipple fill — dots placed within a polygon using quasi-random
 * distribution for even coverage with natural-looking variation.
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

    // Determine dot spacing from density — higher density = tighter grid
    // density 0.2 → spacing ~8px, density 0.5 → spacing ~4.5px, density 0.9 → spacing ~2.2px
    const spacing = Math.max(1.5, (1 - config.density) * 9 + 1.5);
    const cols = Math.ceil(w / spacing);
    const rows = Math.ceil(h / spacing);
    const dotCount = cols * rows;

    const marks: Mark[] = [];

    // Jittered grid for even coverage (not purely random)
    for (let i = 0; i < dotCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Grid position + random jitter within cell (±40% of spacing)
      const x = bounds.minX + (col + 0.5) * spacing + (rng() - 0.5) * spacing * 0.8;
      const y = bounds.minY + (row + 0.5) * spacing + (rng() - 0.5) * spacing * 0.8;

      if (pointInPolygon({ x, y }, region)) {
        marks.push({
          points: [{ x, y }],
          width: config.weight * (0.6 + rng() * 0.4),
          opacity: 0.7 + rng() * 0.3,
        });
      }
    }

    return marks;
  },
};
