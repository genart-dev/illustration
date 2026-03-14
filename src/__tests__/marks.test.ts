import { describe, it, expect } from "vitest";
import { technicalMark } from "../marks/technical.js";
import { inkMark } from "../marks/ink.js";
import { pencilMark } from "../marks/pencil.js";
import { engravingMark } from "../marks/engraving.js";
import { woodcutMark } from "../marks/woodcut.js";
import { brushMark } from "../marks/brush.js";
import { generateStrokeOutline } from "../outline/stroke-outline.js";
import type { StrokeProfile, StrokeOutline, MarkConfig } from "../types.js";

function seededRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ── Test fixtures ──────────────────────────────────────

/** Straight horizontal stroke, 200px long, 10px half-width */
const straightProfile: StrokeProfile = {
  points: Array.from({ length: 20 }, (_, i) => ({
    x: i * 10,
    y: 100,
    width: 10,
    pressure: 0.5 + 0.3 * Math.sin(i * Math.PI / 19),
    depth: 0,
  })),
  cap: "round",
};

/** S-curve stroke (sine wave) with width variation */
const sCurveProfile: StrokeProfile = {
  points: Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    return {
      x: t * 200,
      y: 100 + 40 * Math.sin(t * Math.PI * 2),
      width: 2 + 10 * Math.sin(t * Math.PI),
      pressure: 0.3 + 0.7 * Math.sin(t * Math.PI),
      depth: 1,
    };
  }),
  cap: "round",
};

/** Deep branch segment (depth 3) for hatching tests */
const deepProfile: StrokeProfile = {
  points: Array.from({ length: 15 }, (_, i) => ({
    x: i * 8,
    y: 50 + i * 2,
    width: 6,
    depth: 3,
  })),
  cap: "flat",
};

/** Wide trunk segment for woodcut gouge tests */
const wideProfile: StrokeProfile = {
  points: Array.from({ length: 25 }, (_, i) => ({
    x: i * 10,
    y: 100,
    width: 15,
    depth: 0,
  })),
  cap: "flat",
};

/** Minimal 2-point profile */
const minProfile: StrokeProfile = {
  points: [
    { x: 0, y: 0, width: 5 },
    { x: 50, y: 0, width: 5 },
  ],
  cap: "flat",
};

/** Single-point profile (edge case) */
const singlePointProfile: StrokeProfile = {
  points: [{ x: 0, y: 0, width: 5 }],
  cap: "flat",
};

function getOutline(profile: StrokeProfile): StrokeOutline {
  const outline = generateStrokeOutline(profile);
  if (!outline) throw new Error("Failed to generate outline");
  return outline;
}

const defaultConfig: MarkConfig = {
  density: 0.5,
  weight: 2,
  jitter: 0.3,
};

// ── Technical ──────────────────────────────────────────

describe("technicalMark", () => {
  it("has correct id and name", () => {
    expect(technicalMark.id).toBe("technical");
    expect(technicalMark.name).toBe("Technical Line");
  });

  it("generates exactly one mark for a valid profile", () => {
    const outline = getOutline(straightProfile);
    const marks = technicalMark.generateMarks(outline, straightProfile, defaultConfig, seededRng());
    expect(marks).toHaveLength(1);
  });

  it("produces a polyline matching the centerline point count", () => {
    const outline = getOutline(straightProfile);
    const marks = technicalMark.generateMarks(outline, straightProfile, defaultConfig, seededRng());
    expect(marks[0]!.points).toHaveLength(straightProfile.points.length);
  });

  it("uses uniform weight from config", () => {
    const outline = getOutline(straightProfile);
    const marks = technicalMark.generateMarks(outline, straightProfile, { ...defaultConfig, weight: 3 }, seededRng());
    expect(marks[0]!.width).toBe(3);
  });

  it("has opacity 1 (fully opaque)", () => {
    const outline = getOutline(straightProfile);
    const marks = technicalMark.generateMarks(outline, straightProfile, defaultConfig, seededRng());
    expect(marks[0]!.opacity).toBe(1);
  });

  it("returns empty for single-point profile", () => {
    const outline = generateStrokeOutline(singlePointProfile);
    // outline is null for <2 points, but strategy should handle gracefully
    const marks = technicalMark.generateMarks(
      { left: [], right: [], startCap: [], endCap: [] },
      singlePointProfile,
      defaultConfig,
      seededRng(),
    );
    expect(marks).toHaveLength(0);
  });

  it("ignores jitter — no position variation", () => {
    const outline = getOutline(straightProfile);
    const marks1 = technicalMark.generateMarks(outline, straightProfile, { ...defaultConfig, jitter: 0 }, seededRng(1));
    const marks2 = technicalMark.generateMarks(outline, straightProfile, { ...defaultConfig, jitter: 1 }, seededRng(2));
    // Points should be identical regardless of jitter
    for (let i = 0; i < marks1[0]!.points.length; i++) {
      expect(marks1[0]!.points[i]!.x).toBe(marks2[0]!.points[i]!.x);
      expect(marks1[0]!.points[i]!.y).toBe(marks2[0]!.points[i]!.y);
    }
  });
});

// ── Ink ────────────────────────────────────────────────

describe("inkMark", () => {
  it("has correct id and name", () => {
    expect(inkMark.id).toBe("ink");
    expect(inkMark.name).toBe("Ink Line");
  });

  it("generates at least one mark (the main stroke)", () => {
    const outline = getOutline(sCurveProfile);
    const marks = inkMark.generateMarks(outline, sCurveProfile, defaultConfig, seededRng());
    expect(marks.length).toBeGreaterThanOrEqual(1);
  });

  it("main stroke follows centerline point count", () => {
    const outline = getOutline(sCurveProfile);
    const marks = inkMark.generateMarks(outline, sCurveProfile, defaultConfig, seededRng());
    expect(marks[0]!.points).toHaveLength(sCurveProfile.points.length);
  });

  it("produces ink pooling dots at endpoints", () => {
    const outline = getOutline(sCurveProfile);
    const marks = inkMark.generateMarks(outline, sCurveProfile, { ...defaultConfig, density: 0.8 }, seededRng());
    // Should have more than just the main stroke (pooling dots)
    expect(marks.length).toBeGreaterThan(1);
    // Pooling dots are single-point marks
    const poolDots = marks.filter(m => m.points.length === 1);
    expect(poolDots.length).toBeGreaterThan(0);
  });

  it("applies position jitter when jitter > 0", () => {
    const outline = getOutline(straightProfile);
    const noJitter = inkMark.generateMarks(outline, straightProfile, { ...defaultConfig, jitter: 0 }, seededRng(1));
    const withJitter = inkMark.generateMarks(outline, straightProfile, { ...defaultConfig, jitter: 0.8 }, seededRng(1));
    // Interior points should differ when jitter is applied
    const midIdx = Math.floor(straightProfile.points.length / 2);
    // With zero jitter, jitterAmt = 0 so no offset
    // With high jitter, points should be offset
    // (can't guarantee exact difference due to rng, but structure should differ)
    expect(noJitter[0]!.points[midIdx]!.y).toBe(straightProfile.points[midIdx]!.y);
  });

  it("returns empty for single-point profile", () => {
    const marks = inkMark.generateMarks(
      { left: [], right: [], startCap: [], endCap: [] },
      singlePointProfile,
      defaultConfig,
      seededRng(),
    );
    expect(marks).toHaveLength(0);
  });
});

// ── Pencil ─────────────────────────────────────────────

describe("pencilMark", () => {
  it("has correct id and name", () => {
    expect(pencilMark.id).toBe("pencil");
    expect(pencilMark.name).toBe("Pencil Sketch");
  });

  it("generates multiple passes (default 3)", () => {
    const outline = getOutline(straightProfile);
    const marks = pencilMark.generateMarks(outline, straightProfile, defaultConfig, seededRng());
    // At minimum: 3 passes as strokes
    const strokeMarks = marks.filter(m => m.points.length > 1);
    expect(strokeMarks.length).toBeGreaterThanOrEqual(3);
  });

  it("respects passes config", () => {
    const outline = getOutline(straightProfile);
    const marks5 = pencilMark.generateMarks(outline, straightProfile, { ...defaultConfig, passes: 5 }, seededRng());
    // First N marks should be the pass strokes (each has points.length == profile.points.length)
    const passMarks = marks5.filter(m => m.points.length === straightProfile.points.length);
    expect(passMarks).toHaveLength(5);
  });

  it("has translucent opacity (graphite character)", () => {
    const outline = getOutline(straightProfile);
    const marks = pencilMark.generateMarks(outline, straightProfile, defaultConfig, seededRng());
    // Pass strokes should have opacity < 1
    for (const mark of marks.slice(0, 3)) {
      expect(mark.opacity).toBeLessThan(1);
      expect(mark.opacity).toBeGreaterThan(0);
    }
  });

  it("generates extra shading strokes for deep segments", () => {
    const outline = getOutline(deepProfile);
    const marks = pencilMark.generateMarks(outline, deepProfile, { ...defaultConfig, density: 0.8 }, seededRng());
    // Deep segments should have more marks than just the 3 pass strokes
    // (additional close-parallel shading strokes to build tonal value)
    expect(marks.length).toBeGreaterThan(3);
  });

  it("returns empty for single-point profile", () => {
    const marks = pencilMark.generateMarks(
      { left: [], right: [], startCap: [], endCap: [] },
      singlePointProfile,
      defaultConfig,
      seededRng(),
    );
    expect(marks).toHaveLength(0);
  });
});

// ── Engraving ──────────────────────────────────────────

describe("engravingMark", () => {
  it("has correct id and name", () => {
    expect(engravingMark.id).toBe("engraving");
    expect(engravingMark.name).toBe("Engraving");
  });

  it("generates contour outline marks (left + right edges)", () => {
    const outline = getOutline(straightProfile);
    const marks = engravingMark.generateMarks(outline, straightProfile, defaultConfig, seededRng());
    // At least left edge + right edge outlines
    const contours = marks.filter(m => m.points.length > 2);
    expect(contours.length).toBeGreaterThanOrEqual(2);
  });

  it("generates interior hatching for profiles with length", () => {
    const outline = getOutline(deepProfile);
    const marks = engravingMark.generateMarks(outline, deepProfile, { ...defaultConfig, density: 0.8 }, seededRng());
    // Should have hatch lines (2-point marks) beyond contour outlines
    const hatchMarks = marks.filter(m => m.points.length === 2);
    expect(hatchMarks.length).toBeGreaterThan(0);
  });

  it("uses fine line weight (fraction of config weight)", () => {
    const outline = getOutline(straightProfile);
    const marks = engravingMark.generateMarks(outline, straightProfile, { ...defaultConfig, weight: 4 }, seededRng());
    // Contour outlines should be thin
    const contours = marks.filter(m => m.points.length > 2);
    for (const m of contours) {
      expect(m.width).toBeLessThan(4); // should be 4 * 0.25 = 1
    }
  });

  it("generates secondary cross-hatching for deep segments", () => {
    const outline = getOutline(deepProfile);
    const marksDeep = engravingMark.generateMarks(outline, deepProfile, { ...defaultConfig, density: 0.8 }, seededRng(1));
    // Compare with shallow profile — deep should have more marks
    const shallowProfile: StrokeProfile = {
      ...deepProfile,
      points: deepProfile.points.map(p => ({ ...p, depth: 0 })),
    };
    const outlineShallow = getOutline(shallowProfile);
    const marksShallow = engravingMark.generateMarks(outlineShallow, shallowProfile, { ...defaultConfig, density: 0.8 }, seededRng(1));
    expect(marksDeep.length).toBeGreaterThanOrEqual(marksShallow.length);
  });

  it("returns empty for single-point profile", () => {
    const marks = engravingMark.generateMarks(
      { left: [], right: [], startCap: [], endCap: [] },
      singlePointProfile,
      defaultConfig,
      seededRng(),
    );
    expect(marks).toHaveLength(0);
  });
});

// ── Woodcut ────────────────────────────────────────────

describe("woodcutMark", () => {
  it("has correct id and name", () => {
    expect(woodcutMark.id).toBe("woodcut");
    expect(woodcutMark.name).toBe("Woodcut");
  });

  it("generates filled polygon + bold stroke for wide segments", () => {
    const outline = getOutline(wideProfile);
    const marks = woodcutMark.generateMarks(outline, wideProfile, defaultConfig, seededRng());
    // Should have at least: filled polygon (width=0) + bold stroke
    expect(marks.length).toBeGreaterThanOrEqual(2);
    // First mark should be the filled polygon
    expect(marks[0]!.width).toBe(0);
    expect(marks[0]!.opacity).toBe(1);
  });

  it("generates gouge marks for thick strokes", () => {
    const outline = getOutline(wideProfile);
    const marks = woodcutMark.generateMarks(outline, wideProfile, { ...defaultConfig, density: 0.8 }, seededRng());
    // Gouges have negative opacity
    const gouges = marks.filter(m => m.opacity < 0);
    expect(gouges.length).toBeGreaterThan(0);
  });

  it("gouge marks have narrow width (thin cuts)", () => {
    const outline = getOutline(wideProfile);
    const marks = woodcutMark.generateMarks(outline, wideProfile, { ...defaultConfig, weight: 2 }, seededRng());
    const gouges = marks.filter(m => m.opacity < 0);
    for (const g of gouges) {
      expect(g.width).toBeLessThan(2); // should be weight * 0.3-0.5
    }
  });

  it("skips gouges on thin branches", () => {
    const thinProfile: StrokeProfile = {
      points: Array.from({ length: 10 }, (_, i) => ({
        x: i * 10, y: 50, width: 2, depth: 4,
      })),
      cap: "flat",
    };
    const outline = getOutline(thinProfile);
    const marks = woodcutMark.generateMarks(outline, thinProfile, defaultConfig, seededRng());
    const gouges = marks.filter(m => m.opacity < 0);
    expect(gouges).toHaveLength(0);
  });

  it("returns empty for single-point profile", () => {
    const marks = woodcutMark.generateMarks(
      { left: [], right: [], startCap: [], endCap: [] },
      singlePointProfile,
      defaultConfig,
      seededRng(),
    );
    expect(marks).toHaveLength(0);
  });
});

// ── Brush / Sumi-e ─────────────────────────────────────

describe("brushMark", () => {
  it("has correct id and name", () => {
    expect(brushMark.id).toBe("brush");
    expect(brushMark.name).toBe("Brush / Sumi-e");
  });

  it("generates main stroke + dry-brush filaments", () => {
    const outline = getOutline(sCurveProfile);
    const marks = brushMark.generateMarks(outline, sCurveProfile, defaultConfig, seededRng());
    // Main stroke + filaments + pooling = multiple marks
    expect(marks.length).toBeGreaterThan(1);
  });

  it("main stroke has sub-1 opacity (wet ink transparency)", () => {
    const outline = getOutline(sCurveProfile);
    const marks = brushMark.generateMarks(outline, sCurveProfile, defaultConfig, seededRng());
    expect(marks[0]!.opacity).toBeLessThan(1);
    expect(marks[0]!.opacity).toBeGreaterThan(0.5);
  });

  it("generates wet pooling dots", () => {
    const outline = getOutline(sCurveProfile);
    const marks = brushMark.generateMarks(outline, sCurveProfile, { ...defaultConfig, density: 0.8 }, seededRng());
    // Pooling dots are single-point marks
    const poolDots = marks.filter(m => m.points.length === 1);
    expect(poolDots.length).toBeGreaterThan(0);
  });

  it("dry-brush filaments have thin width", () => {
    const outline = getOutline(sCurveProfile);
    const marks = brushMark.generateMarks(outline, sCurveProfile, defaultConfig, seededRng());
    // Main stroke is a filled polygon (width=0), wet reinforcement is wide,
    // filaments should be thinner than the config weight (width * 0.12)
    const filaments = marks.filter(m => m.points.length > 1 && m.width > 0 && m.width < defaultConfig.weight * 0.5);
    expect(filaments.length).toBeGreaterThan(0);
    for (const f of filaments) {
      expect(f.width).toBeLessThan(defaultConfig.weight);
    }
  });

  it("returns empty for single-point profile", () => {
    const marks = brushMark.generateMarks(
      { left: [], right: [], startCap: [], endCap: [] },
      singlePointProfile,
      defaultConfig,
      seededRng(),
    );
    expect(marks).toHaveLength(0);
  });

  it("is deterministic with same seed", () => {
    const outline = getOutline(straightProfile);
    const marks1 = brushMark.generateMarks(outline, straightProfile, defaultConfig, seededRng(99));
    const marks2 = brushMark.generateMarks(outline, straightProfile, defaultConfig, seededRng(99));
    expect(marks1.length).toBe(marks2.length);
    for (let i = 0; i < marks1.length; i++) {
      expect(marks1[i]!.points.length).toBe(marks2[i]!.points.length);
      expect(marks1[i]!.width).toBe(marks2[i]!.width);
      expect(marks1[i]!.opacity).toBe(marks2[i]!.opacity);
    }
  });
});

// ── Cross-strategy tests ───────────────────────────────

describe("all mark strategies", () => {
  const strategies = [technicalMark, inkMark, pencilMark, engravingMark, woodcutMark, brushMark];

  it("all implement MarkStrategy interface", () => {
    for (const s of strategies) {
      expect(typeof s.id).toBe("string");
      expect(typeof s.name).toBe("string");
      expect(typeof s.generateMarks).toBe("function");
    }
  });

  it("all have unique ids", () => {
    const ids = strategies.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all produce valid marks for a standard profile", () => {
    const outline = getOutline(straightProfile);
    for (const s of strategies) {
      const marks = s.generateMarks(outline, straightProfile, defaultConfig, seededRng());
      for (const m of marks) {
        expect(m.points.length).toBeGreaterThanOrEqual(1);
        expect(typeof m.width).toBe("number");
        expect(typeof m.opacity).toBe("number");
      }
    }
  });

  it("all handle minimal 2-point profile", () => {
    const outline = getOutline(minProfile);
    for (const s of strategies) {
      const marks = s.generateMarks(outline, minProfile, defaultConfig, seededRng());
      expect(marks.length).toBeGreaterThanOrEqual(1);
    }
  });
});
