import { describe, it, expect } from "vitest";
import {
  strokeProfileToStamp,
  strokeProfilesToStamps,
  type StrokeToStampOptions,
} from "../stamp/adapter.js";
import type { StrokeProfile } from "../types.js";
import { DEPTH_STANDARD, DEPTH_DRAMATIC } from "../depth/resolve.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeProfile(widths: number[]): StrokeProfile {
  return {
    points: widths.map((w, i) => ({
      x: i * 10,
      y: 0,
      width: w,
    })),
    cap: "round",
  };
}

const BASE_OPTS: StrokeToStampOptions = {
  brushId: "ink-pen",
  color: "#1a1a1a",
};

// ── Basic mapping ─────────────────────────────────────────────────────────────

describe("strokeProfileToStamp — basic mapping", () => {
  it("returns correct brushId and color", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), BASE_OPTS);
    expect(result.brushId).toBe("ink-pen");
    expect(result.color).toBe("#1a1a1a");
  });

  it("defaults color to #1a1a1a when omitted", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), { brushId: "pencil" });
    expect(result.color).toBe("#1a1a1a");
  });

  it("passes through seed", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), { ...BASE_OPTS, seed: 42 });
    expect(result.seed).toBe(42);
  });

  it("produces one stamp point per profile point", () => {
    const result = strokeProfileToStamp(makeProfile([2, 4, 8, 4, 2]), BASE_OPTS);
    expect(result.points).toHaveLength(5);
  });

  it("preserves x/y coordinates", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), BASE_OPTS);
    expect(result.points[0]!.x).toBe(0);
    expect(result.points[1]!.x).toBe(10);
    expect(result.points[2]!.x).toBe(20);
    expect(result.points.every((p) => p.y === 0)).toBe(true);
  });
});

// ── Width → pressure normalization ──────────────────────────────────────────

describe("strokeProfileToStamp — pressure normalization", () => {
  it("maps min width to pressure 0 and max width to pressure 1", () => {
    const result = strokeProfileToStamp(makeProfile([2, 10, 6]), BASE_OPTS);
    expect(result.points[0]!.pressure).toBe(0);   // width 2 = min
    expect(result.points[1]!.pressure).toBe(1);   // width 10 = max
    expect(result.points[2]!.pressure).toBeCloseTo(0.5); // width 6 = mid
  });

  it("sets pressure 1 uniformly when all widths are equal", () => {
    const result = strokeProfileToStamp(makeProfile([5, 5, 5]), BASE_OPTS);
    expect(result.points.every((p) => p.pressure === 1)).toBe(true);
  });

  it("handles single-point profile", () => {
    const result = strokeProfileToStamp(makeProfile([8]), BASE_OPTS);
    expect(result.points).toHaveLength(1);
    expect(result.points[0]!.pressure).toBe(1);
  });
});

// ── Base size derivation ─────────────────────────────────────────────────────

describe("strokeProfileToStamp — base size", () => {
  it("sets size to 2× max width by default", () => {
    const result = strokeProfileToStamp(makeProfile([2, 12, 6]), BASE_OPTS);
    expect(result.size).toBe(24); // 2 × 12
  });

  it("respects baseSize override", () => {
    const result = strokeProfileToStamp(makeProfile([2, 12, 6]), {
      ...BASE_OPTS,
      baseSize: 30,
    });
    expect(result.size).toBe(30);
  });
});

// ── Empty profile ────────────────────────────────────────────────────────────

describe("strokeProfileToStamp — empty profile", () => {
  it("returns empty points array for empty profile", () => {
    const result = strokeProfileToStamp({ points: [] }, BASE_OPTS);
    expect(result.points).toHaveLength(0);
  });

  it("still has correct brushId and color for empty profile", () => {
    const result = strokeProfileToStamp({ points: [] }, BASE_OPTS);
    expect(result.brushId).toBe("ink-pen");
    expect(result.color).toBe("#1a1a1a");
  });
});

// ── Opacity ──────────────────────────────────────────────────────────────────

describe("strokeProfileToStamp — opacity", () => {
  it("omits opacity field when opacity is 1 (no override needed)", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), {
      ...BASE_OPTS,
      opacity: 1,
    });
    expect(result.opacity).toBeUndefined();
  });

  it("includes opacity when less than 1", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), {
      ...BASE_OPTS,
      opacity: 0.6,
    });
    expect(result.opacity).toBeCloseTo(0.6);
  });

  it("omits opacity when not provided (defaults to 1)", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), BASE_OPTS);
    expect(result.opacity).toBeUndefined();
  });
});

// ── Atmospheric depth modulation ─────────────────────────────────────────────

describe("strokeProfileToStamp — depth modulation", () => {
  it("no modulation when depthConfig is omitted", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), BASE_OPTS);
    expect(result.size).toBe(16); // 2 × 8, no change
    expect(result.opacity).toBeUndefined();
  });

  it("no modulation when sceneDepth is omitted even if depthConfig provided", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), {
      ...BASE_OPTS,
      depthConfig: DEPTH_STANDARD,
      // sceneDepth not provided
    });
    expect(result.size).toBe(16);
  });

  it("foreground stroke (sceneDepth=0) has no size reduction", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), {
      ...BASE_OPTS,
      depthConfig: DEPTH_STANDARD,
      sceneDepth: 0,
    });
    // DEPTH_STANDARD: weight.near=1, far=0.3 → ratio at 0 = 1/1 = 1
    expect(result.size).toBeCloseTo(16);
  });

  it("background stroke (sceneDepth=1) has reduced size", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), {
      ...BASE_OPTS,
      depthConfig: DEPTH_STANDARD,
      sceneDepth: 1,
    });
    // DEPTH_STANDARD: weight.near=1, far=0.3 → ratio = 0.3/1 = 0.3
    expect(result.size).toBeCloseTo(16 * 0.3);
  });

  it("background stroke has reduced opacity", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), {
      ...BASE_OPTS,
      depthConfig: DEPTH_STANDARD,
      sceneDepth: 1,
    });
    // DEPTH_STANDARD: opacity.near=1, far=0.5
    expect(result.opacity).toBeCloseTo(0.5);
  });

  it("midground stroke (sceneDepth=0.5) interpolates correctly", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), {
      ...BASE_OPTS,
      depthConfig: DEPTH_STANDARD,
      sceneDepth: 0.5,
    });
    // weight at 0.5 = lerp(1, 0.3, 0.5) = 0.65 → ratio = 0.65
    expect(result.size).toBeCloseTo(16 * 0.65);
    // opacity at 0.5 = lerp(1, 0.5, 0.5) = 0.75
    expect(result.opacity).toBeCloseTo(0.75);
  });

  it("DEPTH_DRAMATIC produces stronger falloff", () => {
    const standard = strokeProfileToStamp(makeProfile([4, 8, 4]), {
      ...BASE_OPTS,
      depthConfig: DEPTH_STANDARD,
      sceneDepth: 1,
    });
    const dramatic = strokeProfileToStamp(makeProfile([4, 8, 4]), {
      ...BASE_OPTS,
      depthConfig: DEPTH_DRAMATIC,
      sceneDepth: 1,
    });
    // Dramatic far weight=0.15, standard far weight=0.3 — dramatic should be smaller
    expect(dramatic.size!).toBeLessThan(standard.size!);
    expect(dramatic.opacity!).toBeLessThan(standard.opacity!);
  });

  it("base opacity is multiplied by depth opacity", () => {
    const result = strokeProfileToStamp(makeProfile([4, 8, 4]), {
      ...BASE_OPTS,
      opacity: 0.8,
      depthConfig: DEPTH_STANDARD,
      sceneDepth: 1,
    });
    // 0.8 * 0.5 = 0.4
    expect(result.opacity).toBeCloseTo(0.4);
  });
});

// ── strokeProfilesToStamps ────────────────────────────────────────────────────

describe("strokeProfilesToStamps", () => {
  it("converts multiple profiles with shared options", () => {
    const profiles = [makeProfile([2, 8, 2]), makeProfile([4, 4, 4])];
    const results = strokeProfilesToStamps(profiles, BASE_OPTS);
    expect(results).toHaveLength(2);
    expect(results[0]!.brushId).toBe("ink-pen");
    expect(results[1]!.brushId).toBe("ink-pen");
  });

  it("returns empty array for empty input", () => {
    expect(strokeProfilesToStamps([], BASE_OPTS)).toHaveLength(0);
  });

  it("each stroke maps its own width range independently", () => {
    // Profile 1: widths 2–8 → pressure 0–1
    // Profile 2: all width 5 → pressure 1
    const profiles = [makeProfile([2, 8]), makeProfile([5, 5])];
    const results = strokeProfilesToStamps(profiles, BASE_OPTS);
    expect(results[0]!.points[0]!.pressure).toBe(0);
    expect(results[0]!.points[1]!.pressure).toBe(1);
    expect(results[1]!.points[0]!.pressure).toBe(1);
    expect(results[1]!.points[1]!.pressure).toBe(1);
  });
});
