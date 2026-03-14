import { describe, it, expect } from "vitest";
import { mergeSegmentTree } from "../junction/tree-merge.js";
import type { TurtleSegment } from "../outline/adapters.js";

// ── Test data ────────────────────────────────────────────

/** Simple L-system tree: trunk → 2 branches → 4 twigs */
function makeSimpleTree(): TurtleSegment[] {
  // Trunk: depth 0, going up from (100, 200) to (100, 100)
  const trunk: TurtleSegment = {
    x1: 100, y1: 200, x2: 100, y2: 100,
    width: 12, depth: 0, order: 0,
  };

  // Left branch: depth 1, from trunk tip going up-left
  const leftBranch: TurtleSegment = {
    x1: 100, y1: 100, x2: 60, y2: 40,
    width: 8, depth: 1, order: 0,
  };

  // Right branch: depth 1, from trunk tip going up-right
  const rightBranch: TurtleSegment = {
    x1: 100, y1: 100, x2: 140, y2: 40,
    width: 8, depth: 1, order: 1,
  };

  // Left-left twig: depth 2
  const llTwig: TurtleSegment = {
    x1: 60, y1: 40, x2: 40, y2: 10,
    width: 4, depth: 2, order: 0,
  };

  // Left-right twig: depth 2
  const lrTwig: TurtleSegment = {
    x1: 60, y1: 40, x2: 70, y2: 5,
    width: 4, depth: 2, order: 1,
  };

  // Right-left twig: depth 2
  const rlTwig: TurtleSegment = {
    x1: 140, y1: 40, x2: 130, y2: 5,
    width: 4, depth: 2, order: 0,
  };

  // Right-right twig: depth 2
  const rrTwig: TurtleSegment = {
    x1: 140, y1: 40, x2: 160, y2: 10,
    width: 4, depth: 2, order: 1,
  };

  return [trunk, leftBranch, rightBranch, llTwig, lrTwig, rlTwig, rrTwig];
}

/** Single straight segment. */
function makeSingleSegment(): TurtleSegment[] {
  return [{
    x1: 0, y1: 0, x2: 100, y2: 0,
    width: 10, depth: 0, order: 0,
  }];
}

/** Two connected segments at same depth (a chain). */
function makeChain(): TurtleSegment[] {
  return [
    { x1: 0, y1: 0, x2: 50, y2: 0, width: 10, depth: 0, order: 0 },
    { x1: 50, y1: 0, x2: 100, y2: 0, width: 10, depth: 0, order: 0 },
  ];
}

/** Parent with one child branch (parent split at branch point, as in real L-systems). */
function makeSimpleFork(): TurtleSegment[] {
  return [
    // Parent segment 1: going right to branch point
    { x1: 0, y1: 0, x2: 50, y2: 0, width: 10, depth: 0, order: 0 },
    // Parent segment 2: continuing right past branch point
    { x1: 50, y1: 0, x2: 100, y2: 0, width: 10, depth: 0, order: 0 },
    // Child going up from branch point
    { x1: 50, y1: 0, x2: 50, y2: -60, width: 6, depth: 1, order: 0 },
  ];
}

// ── Tests ────────────────────────────────────────────────

describe("mergeSegmentTree", () => {
  it("returns empty array for no segments", () => {
    expect(mergeSegmentTree([])).toEqual([]);
  });

  it("handles a single segment", () => {
    const results = mergeSegmentTree(makeSingleSegment());
    expect(results.length).toBe(1);
    expect(results[0]!.outline.length).toBeGreaterThan(4);
    expect(results[0]!.depth).toBe(0);
    expect(results[0]!.crotches.length).toBe(0);
  });

  it("chains same-depth segments into one profile", () => {
    const results = mergeSegmentTree(makeChain());
    // Should produce one outline (two segments chained into one profile)
    expect(results.length).toBe(1);
    expect(results[0]!.profile.points.length).toBe(3); // 2 segments → 3 points
  });

  it("merges a simple fork (parent + child)", () => {
    const results = mergeSegmentTree(makeSimpleFork());

    // Should produce at least 1 result (the parent with child merged)
    expect(results.length).toBeGreaterThanOrEqual(1);

    // The parent result should have a crotch curve from the junction
    const parentResult = results.find((r) => r.depth === 0);
    expect(parentResult).toBeDefined();
    expect(parentResult!.crotches.length).toBe(1);
  });

  it("produces valid geometry for simple tree", () => {
    const results = mergeSegmentTree(makeSimpleTree());

    // Should produce results
    expect(results.length).toBeGreaterThan(0);

    // All outlines should have finite coordinates
    for (const result of results) {
      for (const pt of result.outline) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it("respects maxOutlineDepth option", () => {
    const allDepths = mergeSegmentTree(makeSimpleTree());
    const depthLimit = mergeSegmentTree(makeSimpleTree(), { maxOutlineDepth: 0 });

    // With depth limit 0, only trunk (depth 0) gets an outline
    const rootResults = depthLimit.filter((r) => r.depth === 0);
    expect(rootResults.length).toBeGreaterThan(0);

    // Should have fewer or equal results with depth limit
    expect(depthLimit.length).toBeLessThanOrEqual(allDepths.length);
  });

  it("applies weight scale to widths", () => {
    const normal = mergeSegmentTree(makeSingleSegment(), { weightScale: 1 });
    const scaled = mergeSegmentTree(makeSingleSegment(), { weightScale: 2 });

    // Scaled version should have wider profile
    const normalW = normal[0]!.profile.points[0]!.width;
    const scaledW = scaled[0]!.profile.points[0]!.width;
    expect(scaledW).toBeCloseTo(normalW * 2);
  });

  it("applies tip taper to leaf branches", () => {
    const withTaper = mergeSegmentTree(makeSingleSegment(), { tipTaper: 20 });
    expect(withTaper[0]!.profile.taper).toBeDefined();
    expect(withTaper[0]!.profile.taper!.end).toBe(20);
  });
});
