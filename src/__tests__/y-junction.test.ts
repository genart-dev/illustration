import { describe, it, expect } from "vitest";
import { mergeYJunction } from "../junction/y-junction.js";
import type { BranchAttachment, StrokeProfile, Point2D } from "../types.js";
import { polygonArea } from "../util/polygon.js";

// ── Test helpers ─────────────────────────────────────────

/** Horizontal parent stroke from (0,0) to (200,0), constant half-width. */
function makeParent(halfWidth = 12): StrokeProfile {
  return {
    points: [
      { x: 0, y: 0, width: halfWidth },
      { x: 50, y: 0, width: halfWidth },
      { x: 100, y: 0, width: halfWidth },
      { x: 150, y: 0, width: halfWidth },
      { x: 200, y: 0, width: halfWidth },
    ],
    cap: "flat",
  };
}

/** Short child stroke, constant half-width. */
function makeChild(halfWidth = 8): StrokeProfile {
  // Child is 80px long, going in whatever direction the angle specifies.
  // The child's actual direction in world space is determined by the
  // attachment angle, but the profile is defined in its own space.
  // For simplicity, define it as going along (1,0) — the junction code
  // uses the angle to determine fork side, not to transform the child.
  //
  // Actually, the child profile should be positioned at the attachment point.
  // The junction code generates outlines for parent and child independently,
  // so the child needs to start at the correct world position.
  // For testing, we'll place the child at x=120 (t=0.6 along a 200px parent)
  // and have it go at the specified angle.
  return {
    points: [
      { x: 120, y: 0, width: halfWidth },
      { x: 120, y: -40, width: halfWidth * 0.8 },
      { x: 120, y: -80, width: halfWidth * 0.5 },
    ],
    cap: "flat",
  };
}

/** Make a child that goes up-left at 60° from horizontal. */
function makeChildAt60(halfWidth = 8): StrokeProfile {
  // At 60° CCW from rightward tangent = up-left in screen coords
  const len = 80;
  const angle = (60 * Math.PI) / 180;
  const dx = Math.cos(angle) * len;
  const dy = -Math.sin(angle) * len; // negative because screen-y is down

  const startX = 120;
  const startY = 0;

  return {
    points: [
      { x: startX, y: startY, width: halfWidth },
      { x: startX + dx * 0.5, y: startY + dy * 0.5, width: halfWidth * 0.8 },
      { x: startX + dx, y: startY + dy, width: halfWidth * 0.5 },
    ],
    cap: "flat",
  };
}

/** Make a child that goes down-right at -60° (forks right). */
function makeChildAtMinus60(halfWidth = 8): StrokeProfile {
  const len = 80;
  const angle = (-60 * Math.PI) / 180;
  const dx = Math.cos(angle) * len;
  const dy = -Math.sin(angle) * len;

  const startX = 120;
  const startY = 0;

  return {
    points: [
      { x: startX, y: startY, width: halfWidth },
      { x: startX + dx * 0.5, y: startY + dy * 0.5, width: halfWidth * 0.8 },
      { x: startX + dx, y: startY + dy, width: halfWidth * 0.5 },
    ],
    cap: "flat",
  };
}

/** Check that a polygon has no self-intersections (simple check: area > 0). */
function hasPositiveArea(polygon: readonly Point2D[]): boolean {
  return Math.abs(polygonArea(polygon)) > 0;
}

/** Check that all points in the polygon are finite numbers. */
function allFinite(polygon: readonly Point2D[]): boolean {
  return polygon.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

// ── Tests ────────────────────────────────────────────────

describe("mergeYJunction", () => {
  it("returns null for single-point profiles", () => {
    const result = mergeYJunction({
      parent: { points: [{ x: 0, y: 0, width: 5 }] },
      child: { points: [{ x: 0, y: 0, width: 3 }] },
      t: 0.5,
      angle: Math.PI / 3,
    });
    expect(result).toBeNull();
  });

  it("produces a valid merged outline for 60° left fork", () => {
    const result = mergeYJunction({
      parent: makeParent(),
      child: makeChildAt60(),
      t: 0.6,
      angle: Math.PI / 3, // 60° CCW → forks left
    });

    expect(result).not.toBeNull();
    expect(result!.outline.length).toBeGreaterThan(10);
    expect(allFinite(result!.outline)).toBe(true);
    expect(hasPositiveArea(result!.outline)).toBe(true);
    expect(result!.crotch.length).toBeGreaterThan(0);
  });

  it("produces a valid merged outline for -60° right fork", () => {
    const result = mergeYJunction({
      parent: makeParent(),
      child: makeChildAtMinus60(),
      t: 0.6,
      angle: -Math.PI / 3, // -60° → forks right
    });

    expect(result).not.toBeNull();
    expect(result!.outline.length).toBeGreaterThan(10);
    expect(allFinite(result!.outline)).toBe(true);
    expect(hasPositiveArea(result!.outline)).toBe(true);
  });

  it("crotch curve has expected number of points", () => {
    const result = mergeYJunction({
      parent: makeParent(),
      child: makeChildAt60(),
      t: 0.6,
      angle: Math.PI / 3,
    });

    // CROTCH_SEGMENTS=8, so 9 points (0..8 inclusive)
    expect(result!.crotch.length).toBe(9);
  });

  it("merged outline is larger than either individual outline", () => {
    const parent = makeParent();
    const child = makeChildAt60();

    const result = mergeYJunction({
      parent,
      child,
      t: 0.6,
      angle: Math.PI / 3,
    });

    // The merged outline should have more points than either individual outline
    // Parent has 5 points → 5 left + 5 right + caps
    // Child has 3 points → 3 left + 3 right + caps
    // Merged should include all of these plus the crotch
    expect(result!.outline.length).toBeGreaterThan(15);
  });

  it("handles narrow fork angle (20°)", () => {
    const child20 = (() => {
      const len = 80;
      const angle = (20 * Math.PI) / 180;
      const dx = Math.cos(angle) * len;
      const dy = -Math.sin(angle) * len;
      return {
        points: [
          { x: 120, y: 0, width: 8 },
          { x: 120 + dx * 0.5, y: dy * 0.5, width: 6 },
          { x: 120 + dx, y: dy, width: 4 },
        ] as const,
        cap: "flat" as const,
      };
    })();

    const result = mergeYJunction({
      parent: makeParent(),
      child: child20,
      t: 0.6,
      angle: (20 * Math.PI) / 180,
    });

    expect(result).not.toBeNull();
    expect(allFinite(result!.outline)).toBe(true);
    expect(hasPositiveArea(result!.outline)).toBe(true);
  });

  it("handles wide fork angle (150°)", () => {
    const child150 = (() => {
      const len = 80;
      const angle = (150 * Math.PI) / 180;
      const dx = Math.cos(angle) * len;
      const dy = -Math.sin(angle) * len;
      return {
        points: [
          { x: 120, y: 0, width: 8 },
          { x: 120 + dx * 0.5, y: dy * 0.5, width: 6 },
          { x: 120 + dx, y: dy, width: 4 },
        ] as const,
        cap: "flat" as const,
      };
    })();

    const result = mergeYJunction({
      parent: makeParent(),
      child: child150,
      t: 0.6,
      angle: (150 * Math.PI) / 180,
    });

    expect(result).not.toBeNull();
    expect(allFinite(result!.outline)).toBe(true);
    expect(hasPositiveArea(result!.outline)).toBe(true);
  });

  it("attachment at t=0.1 (near start) produces valid geometry", () => {
    const child = {
      points: [
        { x: 20, y: 0, width: 6 },
        { x: 20, y: -40, width: 4 },
        { x: 20, y: -80, width: 2 },
      ],
      cap: "flat" as const,
    };

    const result = mergeYJunction({
      parent: makeParent(),
      child,
      t: 0.1,
      angle: Math.PI / 2, // straight up
    });

    expect(result).not.toBeNull();
    expect(allFinite(result!.outline)).toBe(true);
  });

  it("attachment at t=0.9 (near end) produces valid geometry", () => {
    const child = {
      points: [
        { x: 180, y: 0, width: 6 },
        { x: 180, y: -40, width: 4 },
        { x: 180, y: -80, width: 2 },
      ],
      cap: "flat" as const,
    };

    const result = mergeYJunction({
      parent: makeParent(),
      child,
      t: 0.9,
      angle: Math.PI / 2,
    });

    expect(result).not.toBeNull();
    expect(allFinite(result!.outline)).toBe(true);
  });

  it("crotch curve endpoints are close to the expected edge points", () => {
    const result = mergeYJunction({
      parent: makeParent(12),
      child: makeChildAt60(8),
      t: 0.6,
      angle: Math.PI / 3,
    });

    const crotch = result!.crotch;
    const first = crotch[0]!;
    const last = crotch[crotch.length - 1]!;

    // The crotch curve should start near the child's inner base
    // and end near the parent's fork-side edge at the attachment
    // Both should be within a reasonable distance of the attachment point (120,0)
    const distFromAttach1 = Math.sqrt((first.x - 120) ** 2 + first.y ** 2);
    const distFromAttach2 = Math.sqrt((last.x - 120) ** 2 + last.y ** 2);

    // Within 2× the larger half-width of the attachment area
    expect(distFromAttach1).toBeLessThan(30);
    expect(distFromAttach2).toBeLessThan(30);
  });

  it("left and right fork produce mirror-like outlines", () => {
    const leftResult = mergeYJunction({
      parent: makeParent(),
      child: makeChildAt60(),
      t: 0.6,
      angle: Math.PI / 3,
    });

    const rightResult = mergeYJunction({
      parent: makeParent(),
      child: makeChildAtMinus60(),
      t: 0.6,
      angle: -Math.PI / 3,
    });

    // Both should produce valid outlines with similar point counts
    expect(leftResult!.outline.length).toBe(rightResult!.outline.length);
    // Both should have similar absolute area (mirror image)
    const leftArea = Math.abs(polygonArea(leftResult!.outline));
    const rightArea = Math.abs(polygonArea(rightResult!.outline));
    // Areas won't be exactly equal due to miter calculations at different angles
    expect(Math.abs(leftArea - rightArea) / leftArea).toBeLessThan(0.5);
  });
});
