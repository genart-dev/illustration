import { describe, it, expect } from "vitest";
import {
  generateStrokeOutline,
  generateStrokePolygon,
} from "../outline/stroke-outline.js";
import type { StrokeProfile, StrokeOutline } from "../types.js";
import { polygonArea } from "../util/polygon.js";

describe("generateStrokeOutline", () => {
  it("returns null for fewer than 2 points", () => {
    expect(generateStrokeOutline({ points: [] })).toBeNull();
    expect(
      generateStrokeOutline({ points: [{ x: 0, y: 0, width: 5 }] }),
    ).toBeNull();
  });

  it("generates outline for a horizontal line", () => {
    const profile: StrokeProfile = {
      points: [
        { x: 0, y: 0, width: 10 },
        { x: 100, y: 0, width: 10 },
      ],
    };
    const outline = generateStrokeOutline(profile);
    expect(outline).not.toBeNull();
    expect(outline!.left).toHaveLength(2);
    expect(outline!.right).toHaveLength(2);

    // Left and right edges should be on opposite sides of centerline
    // (normalLeft of (1,0) = (0,1) = positive y in screen coords)
    const leftY = outline!.left[0]!.y;
    const rightY = outline!.right[0]!.y;
    expect(leftY).not.toEqual(rightY);
    expect(Math.abs(leftY - rightY)).toBeCloseTo(20, 0); // 2 * width=10
  });

  it("generates outline for a vertical line", () => {
    const profile: StrokeProfile = {
      points: [
        { x: 0, y: 0, width: 5 },
        { x: 0, y: 100, width: 5 },
      ],
    };
    const outline = generateStrokeOutline(profile);
    expect(outline).not.toBeNull();

    // Left should be to the right (positive x) for downward line
    // (left normal of (0,1) tangent is (−1,0)... actually let's just check separation)
    const leftX = outline!.left[0]!.x;
    const rightX = outline!.right[0]!.x;
    expect(leftX).not.toEqual(rightX);
    expect(Math.abs(leftX - rightX)).toBeCloseTo(10, 0); // 2 * width
  });

  it("respects per-point width variation", () => {
    const profile: StrokeProfile = {
      points: [
        { x: 0, y: 0, width: 2 },
        { x: 50, y: 0, width: 10 },
        { x: 100, y: 0, width: 2 },
      ],
      cap: "flat",
    };
    const outline = generateStrokeOutline(profile);
    expect(outline).not.toBeNull();

    // Middle point should have wider offset than endpoints
    const midLeftY = Math.abs(outline!.left[1]!.y);
    const startLeftY = Math.abs(outline!.left[0]!.y);
    expect(midLeftY).toBeGreaterThan(startLeftY);
  });

  it("applies taper at start and end", () => {
    const profile: StrokeProfile = {
      points: [
        { x: 0, y: 0, width: 10 },
        { x: 50, y: 0, width: 10 },
        { x: 100, y: 0, width: 10 },
      ],
      taper: { start: 30, end: 30 },
      cap: "flat",
    };
    const outline = generateStrokeOutline(profile);
    expect(outline).not.toBeNull();

    // Start point should be narrower than middle (tapered)
    const startWidth = Math.abs(outline!.left[0]!.y - outline!.right[0]!.y);
    const midWidth = Math.abs(outline!.left[1]!.y - outline!.right[1]!.y);
    expect(startWidth).toBeLessThan(midWidth);
  });

  it("generates round caps by default", () => {
    const profile: StrokeProfile = {
      points: [
        { x: 0, y: 0, width: 10 },
        { x: 100, y: 0, width: 10 },
      ],
    };
    const outline = generateStrokeOutline(profile);
    expect(outline).not.toBeNull();
    expect(outline!.startCap.length).toBeGreaterThan(0);
    expect(outline!.endCap.length).toBeGreaterThan(0);
  });

  it("generates no cap points for flat cap style", () => {
    const profile: StrokeProfile = {
      points: [
        { x: 0, y: 0, width: 10 },
        { x: 100, y: 0, width: 10 },
      ],
      cap: "flat",
    };
    const outline = generateStrokeOutline(profile);
    expect(outline).not.toBeNull();
    expect(outline!.startCap).toHaveLength(0);
    expect(outline!.endCap).toHaveLength(0);
  });

  it("generates a single point for pointed cap", () => {
    const profile: StrokeProfile = {
      points: [
        { x: 0, y: 0, width: 10 },
        { x: 100, y: 0, width: 10 },
      ],
      cap: "pointed",
    };
    const outline = generateStrokeOutline(profile);
    expect(outline).not.toBeNull();
    expect(outline!.endCap).toHaveLength(1);
    // The pointed cap should extend beyond the last centerline point
    expect(outline!.endCap[0]!.x).toBeGreaterThan(100);
  });

  it("handles multi-point curved path", () => {
    // Quarter-circle arc approximation
    const profile: StrokeProfile = {
      points: [
        { x: 0, y: 0, width: 5 },
        { x: 30, y: 10, width: 5 },
        { x: 50, y: 30, width: 5 },
        { x: 60, y: 60, width: 5 },
      ],
      cap: "flat",
    };
    const outline = generateStrokeOutline(profile);
    expect(outline).not.toBeNull();
    expect(outline!.left).toHaveLength(4);
    expect(outline!.right).toHaveLength(4);
  });
});

describe("generateStrokePolygon", () => {
  it("returns a closed polygon with positive area", () => {
    const profile: StrokeProfile = {
      points: [
        { x: 0, y: 0, width: 10 },
        { x: 100, y: 0, width: 10 },
      ],
      cap: "flat",
    };
    const polygon = generateStrokePolygon(profile);
    expect(polygon).not.toBeNull();
    expect(polygon!.length).toBeGreaterThanOrEqual(4);

    const area = Math.abs(polygonArea(polygon!));
    // Area should be approximately width * length = 20 * 100 = 2000
    expect(area).toBeGreaterThan(1500);
    expect(area).toBeLessThan(2500);
  });
});
