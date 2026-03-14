import { describe, it, expect } from "vitest";
import { taperScale } from "../outline/taper.js";

describe("taperScale", () => {
  it("returns 1 with no taper", () => {
    expect(taperScale(50, 100, undefined)).toBe(1);
  });

  it("returns 1 with zero-length taper", () => {
    expect(taperScale(50, 100, { start: 0, end: 0 })).toBe(1);
  });

  it("tapers at start", () => {
    const scale0 = taperScale(0, 100, { start: 20 });
    const scale10 = taperScale(10, 100, { start: 20 });
    const scale20 = taperScale(20, 100, { start: 20 });
    const scale50 = taperScale(50, 100, { start: 20 });

    expect(scale0).toBe(0);
    expect(scale10).toBeCloseTo(0.5);
    expect(scale20).toBe(1);
    expect(scale50).toBe(1);
  });

  it("tapers at end", () => {
    const scale50 = taperScale(50, 100, { end: 20 });
    const scale90 = taperScale(90, 100, { end: 20 });
    const scale100 = taperScale(100, 100, { end: 20 });

    expect(scale50).toBe(1);
    expect(scale90).toBeCloseTo(0.5);
    expect(scale100).toBe(0);
  });

  it("applies ease-in curve", () => {
    // ease-in = t^2, so at t=0.5 → 0.25
    const scale = taperScale(10, 100, { start: 20, curve: "ease-in" });
    expect(scale).toBeCloseTo(0.25);
  });

  it("applies ease-out curve", () => {
    // ease-out = 1-(1-t)^2, so at t=0.5 → 0.75
    const scale = taperScale(10, 100, { start: 20, curve: "ease-out" });
    expect(scale).toBeCloseTo(0.75);
  });

  it("handles both start and end taper simultaneously", () => {
    // At the very start, start taper makes it 0
    expect(taperScale(0, 100, { start: 10, end: 10 })).toBe(0);
    // At the very end, end taper makes it 0
    expect(taperScale(100, 100, { start: 10, end: 10 })).toBe(0);
    // In the middle, both tapers are at 1
    expect(taperScale(50, 100, { start: 10, end: 10 })).toBe(1);
  });
});
