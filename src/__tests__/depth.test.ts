import { describe, it, expect } from "vitest";
import {
  resolveDepth,
  applyDepthToMarkConfig,
  applyDepthToFillConfig,
  applyDepthToMarks,
  DEPTH_STANDARD,
  DEPTH_DRAMATIC,
  DEPTH_SUBTLE,
} from "../depth/resolve.js";
import type { AtmosphericDepthConfig, MarkConfig, FillConfig, Mark } from "../types.js";

const config: AtmosphericDepthConfig = {
  weight: { near: 8, far: 2 },
  opacity: { near: 1, far: 0.25 },
  density: { near: 0.9, far: 0.2 },
  detail: { near: 1, far: 0.3 },
  easing: "linear",
};

describe("resolveDepth", () => {
  it("returns near values at depth 0", () => {
    const r = resolveDepth(0, config);
    expect(r.weight).toBe(8);
    expect(r.opacity).toBe(1);
    expect(r.density).toBe(0.9);
    expect(r.detail).toBe(1);
  });

  it("returns far values at depth 1", () => {
    const r = resolveDepth(1, config);
    expect(r.weight).toBe(2);
    expect(r.opacity).toBe(0.25);
    expect(r.density).toBeCloseTo(0.2);
    expect(r.detail).toBeCloseTo(0.3);
  });

  it("interpolates at depth 0.5", () => {
    const r = resolveDepth(0.5, config);
    expect(r.weight).toBe(5);
    expect(r.opacity).toBe(0.625);
    expect(r.density).toBeCloseTo(0.55);
    expect(r.detail).toBeCloseTo(0.65);
  });

  it("clamps depth below 0", () => {
    const r = resolveDepth(-0.5, config);
    expect(r.weight).toBe(8);
    expect(r.opacity).toBe(1);
  });

  it("clamps depth above 1", () => {
    const r = resolveDepth(1.5, config);
    expect(r.weight).toBe(2);
    expect(r.opacity).toBe(0.25);
  });

  it("applies ease-out easing", () => {
    const eased = resolveDepth(0.5, { ...config, easing: "ease-out" });
    // ease-out at 0.5 → 1 - (1-0.5)^2 = 0.75
    // weight: 8 + (2-8) * 0.75 = 8 - 4.5 = 3.5
    expect(eased.weight).toBeCloseTo(3.5);
  });

  it("applies ease-in easing", () => {
    const eased = resolveDepth(0.5, { ...config, easing: "ease-in" });
    // ease-in at 0.5 → 0.25
    // weight: 8 + (2-8) * 0.25 = 8 - 1.5 = 6.5
    expect(eased.weight).toBeCloseTo(6.5);
  });
});

describe("applyDepthToMarkConfig", () => {
  const baseConfig: MarkConfig = { density: 0.8, weight: 6, jitter: 0.5 };

  it("scales weight and density at foreground", () => {
    const { config: mc, opacity } = applyDepthToMarkConfig(baseConfig, 0, config);
    expect(mc.weight).toBe(6); // 6 * (8/8)
    expect(mc.density).toBeCloseTo(0.8); // 0.8 * (0.9/0.9)
    expect(opacity).toBe(1);
  });

  it("scales weight and density at background", () => {
    const { config: mc, opacity } = applyDepthToMarkConfig(baseConfig, 1, config);
    expect(mc.weight).toBeCloseTo(1.5); // 6 * (2/8)
    expect(mc.density).toBeCloseTo(0.178, 2); // 0.8 * (0.2/0.9)
    expect(opacity).toBe(0.25);
  });

  it("preserves jitter", () => {
    const { config: mc } = applyDepthToMarkConfig(baseConfig, 0.5, config);
    expect(mc.jitter).toBe(0.5);
  });
});

describe("applyDepthToFillConfig", () => {
  const baseConfig: FillConfig = { density: 0.7, weight: 1, angle: Math.PI / 4 };

  it("scales at midground", () => {
    const { config: fc, opacity } = applyDepthToFillConfig(baseConfig, 0.5, config);
    // weight: 1 * (5/8) = 0.625
    expect(fc.weight).toBeCloseTo(0.625);
    expect(fc.angle).toBe(Math.PI / 4);
    expect(opacity).toBe(0.625);
  });
});

describe("applyDepthToMarks", () => {
  const marks: Mark[] = [
    { points: [{ x: 0, y: 0 }], width: 2, opacity: 0.8 },
    { points: [{ x: 1, y: 1 }], width: 1, opacity: 0.5 },
  ];

  it("scales opacity", () => {
    const result = applyDepthToMarks(marks, 0.5);
    expect(result[0]!.opacity).toBe(0.4);
    expect(result[1]!.opacity).toBe(0.25);
  });

  it("returns original marks at opacity 1", () => {
    const result = applyDepthToMarks(marks, 1);
    expect(result).toBe(marks); // same reference
  });
});

describe("presets", () => {
  it("DEPTH_STANDARD has reasonable values", () => {
    const fg = resolveDepth(0, DEPTH_STANDARD);
    const bg = resolveDepth(1, DEPTH_STANDARD);
    expect(fg.weight).toBe(1);
    expect(bg.weight).toBeCloseTo(0.3);
    expect(fg.opacity).toBe(1);
    expect(bg.opacity).toBeCloseTo(0.5);
  });

  it("DEPTH_DRAMATIC has stronger contrast", () => {
    const fg = resolveDepth(0, DEPTH_DRAMATIC);
    const bg = resolveDepth(1, DEPTH_DRAMATIC);
    expect(fg.weight).toBe(1.3);
    expect(bg.weight).toBeCloseTo(0.1);
    expect(bg.opacity).toBeCloseTo(0.15);
  });

  it("DEPTH_SUBTLE has gentle falloff", () => {
    const bg = resolveDepth(1, DEPTH_SUBTLE);
    expect(bg.weight).toBe(0.5);
    expect(bg.opacity).toBe(0.5);
  });
});
