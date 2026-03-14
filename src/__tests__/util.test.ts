import { describe, it, expect } from "vitest";
import {
  dist, lerp, tangent, normalLeft, normalRight,
  dot, cross, normalize, add, sub, scale,
} from "../util/vec.js";
import { buildArcLengthTable, cumulativeArcLengths } from "../util/arc-length.js";
import { interpolateCatmullRom } from "../util/catmull-rom.js";
import { pointInPolygon, polygonArea, polygonBounds, offsetPolygon } from "../util/polygon.js";

describe("vec", () => {
  it("computes distance", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("lerps between points", () => {
    const p = lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5);
    expect(p.x).toBe(5);
    expect(p.y).toBe(10);
  });

  it("computes unit tangent", () => {
    const t = tangent({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(t.x).toBeCloseTo(1);
    expect(t.y).toBeCloseTo(0);
  });

  it("left normal is perpendicular CCW", () => {
    const n = normalLeft({ x: 1, y: 0 });
    expect(n.x).toBeCloseTo(0);
    expect(n.y).toBeCloseTo(1);
  });

  it("right normal is perpendicular CW", () => {
    const n = normalRight({ x: 1, y: 0 });
    expect(n.x).toBeCloseTo(0);
    expect(n.y).toBeCloseTo(-1);
  });

  it("dot product works", () => {
    expect(dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
    expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
  });
});

describe("arc-length", () => {
  it("builds table for a straight line", () => {
    const table = buildArcLengthTable([
      { x: 0, y: 0 }, { x: 100, y: 0 },
    ]);
    expect(table.totalLength).toBe(100);

    const mid = table.sampleAt(50);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(0);
  });

  it("sampleAtT(0.5) returns midpoint", () => {
    const table = buildArcLengthTable([
      { x: 0, y: 0 }, { x: 0, y: 200 },
    ]);
    const mid = table.sampleAtT(0.5);
    expect(mid.y).toBeCloseTo(100);
  });

  it("clamps to endpoints", () => {
    const table = buildArcLengthTable([
      { x: 10, y: 20 }, { x: 30, y: 40 },
    ]);
    const start = table.sampleAt(-10);
    expect(start.x).toBe(10);
    const end = table.sampleAt(999);
    expect(end.x).toBe(30);
  });

  it("cumulativeArcLengths returns correct values", () => {
    const lengths = cumulativeArcLengths([
      { x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 8 },
    ]);
    expect(lengths).toHaveLength(3);
    expect(lengths[0]).toBe(0);
    expect(lengths[1]).toBeCloseTo(5);
    expect(lengths[2]).toBeCloseTo(10);
  });
});

describe("catmull-rom", () => {
  it("produces more points than input", () => {
    const result = interpolateCatmullRom([
      { x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 },
    ]);
    expect(result.length).toBeGreaterThan(3);
  });

  it("starts near the first point", () => {
    const result = interpolateCatmullRom([
      { x: 10, y: 20 }, { x: 50, y: 80 }, { x: 90, y: 20 },
    ]);
    expect(dist(result[0]!, { x: 10, y: 20 })).toBeLessThan(1);
  });

  it("returns 2-point input subdivided", () => {
    const result = interpolateCatmullRom([
      { x: 0, y: 0 }, { x: 100, y: 0 },
    ], 4);
    expect(result).toHaveLength(5); // 4 segments + 1 = 5 points
  });
});

describe("polygon", () => {
  const square = [
    { x: 0, y: 0 }, { x: 100, y: 0 },
    { x: 100, y: 100 }, { x: 0, y: 100 },
  ];

  it("pointInPolygon detects inside", () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
  });

  it("pointInPolygon detects outside", () => {
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });

  it("polygonArea computes correct area", () => {
    // CW winding → negative area
    const area = polygonArea(square);
    expect(Math.abs(area)).toBeCloseTo(10000);
  });

  it("polygonBounds returns correct bounds", () => {
    const bounds = polygonBounds(square);
    expect(bounds.minX).toBe(0);
    expect(bounds.maxX).toBe(100);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxY).toBe(100);
  });

  it("offsetPolygon expands a polygon", () => {
    const expanded = offsetPolygon(square, 10);
    expect(expanded).not.toBeNull();
    const bounds = polygonBounds(expanded!);
    // Should be roughly 10 units bigger on each side
    expect(bounds.minX).toBeLessThan(-5);
    expect(bounds.maxX).toBeGreaterThan(105);
  });

  it("offsetPolygon returns null for degenerate input", () => {
    expect(offsetPolygon([], 5)).toBeNull();
    expect(offsetPolygon([{ x: 0, y: 0 }], 5)).toBeNull();
  });
});
