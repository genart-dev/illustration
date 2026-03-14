import { describe, it, expect } from "vitest";
import {
  smoothAtIndex,
  enforceG1AtJunctions,
  tangentDiscontinuity,
  subdivideSharpCorners,
} from "../junction/continuity.js";
import type { Point2D } from "../types.js";

describe("tangentDiscontinuity", () => {
  it("returns 0 for collinear points", () => {
    const poly: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    expect(tangentDiscontinuity(poly, 1)).toBeCloseTo(0, 5);
  });

  it("returns π/2 for 90° corner", () => {
    const poly: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(tangentDiscontinuity(poly, 1)).toBeCloseTo(Math.PI / 2, 2);
  });

  it("returns π for 180° reversal", () => {
    const poly: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(tangentDiscontinuity(poly, 1)).toBeCloseTo(Math.PI, 2);
  });
});

describe("smoothAtIndex", () => {
  it("moves a sharp corner toward the midpoint of its neighbors", () => {
    const points: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }, // sharp 90° corner
      { x: 20, y: 10 },
    ];

    const original = { ...points[2]! };
    smoothAtIndex(points, 2, 0.5, 0);

    // Point should have moved from (10, 10) toward midpoint of (10,0) and (20,10) = (15, 5)
    const mid = { x: 15, y: 5 };
    // With strength 0.5, new position ≈ lerp(original, mid, 0.5)
    expect(points[2]!.x).toBeCloseTo(12.5, 1);
    expect(points[2]!.y).toBeCloseTo(7.5, 1);
  });

  it("does nothing with strength 0", () => {
    const points: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];

    const original = { ...points[1]! };
    smoothAtIndex(points, 1, 0);
    expect(points[1]!.x).toBe(original.x);
    expect(points[1]!.y).toBe(original.y);
  });

  it("handles boundary indices", () => {
    const points: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ];

    // Should not throw at index 0
    expect(() => smoothAtIndex(points, 0, 0.5)).not.toThrow();
    // Should not throw at last index
    expect(() => smoothAtIndex(points, 2, 0.5)).not.toThrow();
  });
});

describe("enforceG1AtJunctions", () => {
  it("reduces tangent discontinuity at specified indices", () => {
    const polygon: Point2D[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 }, // sharp corner
      { x: 0, y: 20 },
    ];

    const before = tangentDiscontinuity(polygon, 2);
    enforceG1AtJunctions(polygon, [2], 0.5);
    const after = tangentDiscontinuity(polygon, 2);

    expect(after).toBeLessThan(before);
  });
});

describe("subdivideSharpCorners", () => {
  it("adds midpoints at sharp corners", () => {
    const polygon: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }, // 90° corner, > 30° threshold
      { x: 0, y: 10 },
    ];

    const result = subdivideSharpCorners(polygon, Math.PI / 6);
    // Should have more points than the original
    expect(result.length).toBeGreaterThan(polygon.length);
  });

  it("does not add points for gentle curves", () => {
    // A smooth circle (very small angle changes between adjacent points)
    const polygon: Point2D[] = [];
    const n = 36; // 10° per step → well under 30° threshold
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI;
      polygon.push({
        x: 100 * Math.cos(angle),
        y: 100 * Math.sin(angle),
      });
    }

    const result = subdivideSharpCorners(polygon, Math.PI / 6);
    expect(result.length).toBe(polygon.length);
  });

  it("returns a copy when polygon is too small", () => {
    const polygon: Point2D[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const result = subdivideSharpCorners(polygon);
    expect(result).toEqual(polygon);
    expect(result).not.toBe(polygon);
  });
});
