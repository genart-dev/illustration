import { describe, it, expect } from "vitest";
import {
  segmentToProfile,
  segmentsToProfiles,
  algorithmPathToProfile,
} from "../outline/adapters.js";
import { generateStrokeOutline } from "../outline/stroke-outline.js";

describe("segmentToProfile", () => {
  it("converts a TurtleSegment to a 2-point StrokeProfile", () => {
    const seg = { x1: 0, y1: 0, x2: 100, y2: 0, width: 10, depth: 0, order: 0 };
    const profile = segmentToProfile(seg);

    expect(profile.points).toHaveLength(2);
    expect(profile.points[0]!.x).toBe(0);
    expect(profile.points[1]!.x).toBe(100);
    expect(profile.points[0]!.width).toBe(5); // half-width
  });

  it("applies weight scale", () => {
    const seg = { x1: 0, y1: 0, x2: 100, y2: 0, width: 10, depth: 0, order: 0 };
    const profile = segmentToProfile(seg, { weightScale: 2 });

    expect(profile.points[0]!.width).toBe(10); // 10 * 2 * 0.5
  });

  it("applies taper ratio", () => {
    const seg = { x1: 0, y1: 0, x2: 100, y2: 0, width: 10, depth: 0, order: 0 };
    const profile = segmentToProfile(seg, { taperRatio: 0.5 });

    expect(profile.points[0]!.width).toBe(5);
    expect(profile.points[1]!.width).toBe(2.5);
  });

  it("produces valid outline when piped through generateStrokeOutline", () => {
    const seg = { x1: 0, y1: 100, x2: 0, y2: 0, width: 8, depth: 1, order: 0 };
    const profile = segmentToProfile(seg);
    const outline = generateStrokeOutline(profile);

    expect(outline).not.toBeNull();
    expect(outline!.left).toHaveLength(2);
  });
});

describe("segmentsToProfiles", () => {
  it("chains connected segments into a single profile", () => {
    const segments = [
      { x1: 0, y1: 0, x2: 50, y2: 0, width: 10, depth: 0, order: 0 },
      { x1: 50, y1: 0, x2: 100, y2: 0, width: 8, depth: 0, order: 1 },
    ];
    const profiles = segmentsToProfiles(segments);

    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.points).toHaveLength(3); // start + 2 end points
  });

  it("splits disconnected segments into separate profiles", () => {
    const segments = [
      { x1: 0, y1: 0, x2: 50, y2: 0, width: 10, depth: 0, order: 0 },
      { x1: 200, y1: 200, x2: 250, y2: 200, width: 5, depth: 1, order: 0 },
    ];
    const profiles = segmentsToProfiles(segments);

    expect(profiles).toHaveLength(2);
  });

  it("handles an empty segment list", () => {
    expect(segmentsToProfiles([])).toHaveLength(0);
  });
});

describe("algorithmPathToProfile", () => {
  it("converts a basic path", () => {
    const path = {
      points: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }],
      width: 6,
    };
    const profile = algorithmPathToProfile(path);

    expect(profile.points).toHaveLength(3);
    expect(profile.points[0]!.width).toBe(3); // half-width
  });

  it("maps pressure to width", () => {
    const path = {
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      width: 10,
      pressure: [1, 0.5],
    };
    const profile = algorithmPathToProfile(path);

    expect(profile.points[0]!.width).toBe(5);   // 10 * 0.5 * 1
    expect(profile.points[1]!.width).toBe(2.5);  // 10 * 0.5 * 0.5
  });

  it("uses default width when path.width is undefined", () => {
    const path = {
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    };
    const profile = algorithmPathToProfile(path, { defaultWidth: 4 });

    expect(profile.points[0]!.width).toBe(2); // 4 * 0.5
  });
});
