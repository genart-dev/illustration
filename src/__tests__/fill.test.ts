import { describe, it, expect } from "vitest";
import { hatchFill } from "../fill/hatch.js";
import { crosshatchFill } from "../fill/crosshatch.js";
import { stippleFill } from "../fill/stipple.js";

function seededRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const square = [
  { x: 0, y: 0 }, { x: 100, y: 0 },
  { x: 100, y: 100 }, { x: 0, y: 100 },
];

describe("hatchFill", () => {
  it("generates marks inside a square", () => {
    const marks = hatchFill.generateFill(square, {
      density: 0.5,
      weight: 1,
      angle: 0,
    }, seededRng());

    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(mark.points.length).toBeGreaterThanOrEqual(2);
      expect(mark.width).toBe(1);
    }
  });

  it("generates more marks at higher density", () => {
    const rng1 = seededRng(1);
    const rng2 = seededRng(1);
    const low = hatchFill.generateFill(square, {
      density: 0.2, weight: 1, angle: 0,
    }, rng1);
    const high = hatchFill.generateFill(square, {
      density: 0.9, weight: 1, angle: 0,
    }, rng2);

    expect(high.length).toBeGreaterThan(low.length);
  });
});

describe("crosshatchFill", () => {
  it("generates more marks than single hatch", () => {
    const rng1 = seededRng(1);
    const rng2 = seededRng(1);
    const hatch = hatchFill.generateFill(square, {
      density: 0.5, weight: 1, angle: 0,
    }, rng1);
    const cross = crosshatchFill.generateFill(square, {
      density: 0.5, weight: 1, angle: 0,
    }, rng2);

    expect(cross.length).toBeGreaterThan(hatch.length);
  });
});

describe("stippleFill", () => {
  it("generates dots inside a square", () => {
    const marks = stippleFill.generateFill(square, {
      density: 0.5, weight: 1, angle: 0, jitter: 0,
    }, seededRng());

    expect(marks.length).toBeGreaterThan(0);
    // Stipple dots are single-point marks
    for (const mark of marks) {
      expect(mark.points).toHaveLength(1);
    }
  });
});
