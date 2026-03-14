/**
 * Crosshatch fill — two passes of parallel hatching at different angles.
 */

import type { Point2D, Mark, FillConfig, FillStrategy } from "../types.js";
import { hatchFill } from "./hatch.js";

export const crosshatchFill: FillStrategy = {
  id: "crosshatch",
  name: "Crosshatch",

  generateFill(
    region: readonly Point2D[],
    config: FillConfig,
    rng: () => number,
  ): Mark[] {
    const marks = hatchFill.generateFill(region, config, rng);

    const secondAngle = config.secondaryAngle ?? config.angle + Math.PI / 4;
    const secondConfig = { ...config, angle: secondAngle };
    const secondMarks = hatchFill.generateFill(region, secondConfig, rng);

    return [...marks, ...secondMarks];
  },
};
