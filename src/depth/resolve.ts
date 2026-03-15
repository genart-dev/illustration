/**
 * Atmospheric depth resolution — interpolate visual properties across distance.
 *
 * Given a normalized depth (0 = foreground, 1 = background) and an
 * AtmosphericDepthConfig, produces coordinated weight, opacity, density,
 * and detail values for rendering at that distance.
 */

import type {
  AtmosphericDepthConfig,
  DepthRange,
  ResolvedDepth,
  TaperCurve,
  MarkConfig,
  FillConfig,
} from "../types.js";

/**
 * Resolve visual properties at a given depth.
 *
 * @param depth Normalized depth (0 = foreground/near, 1 = background/far).
 *              Values outside [0,1] are clamped.
 * @param config Atmospheric depth configuration.
 * @returns Resolved visual properties.
 */
export function resolveDepth(
  depth: number,
  config: AtmosphericDepthConfig,
): ResolvedDepth {
  const t = clamp01(depth);
  const eased = applyEasing(t, config.easing ?? "linear");

  return {
    weight: lerp(config.weight, eased),
    opacity: lerp(config.opacity, eased),
    density: lerp(config.density, eased),
    detail: lerp(config.detail, eased),
  };
}

/**
 * Apply atmospheric depth to a MarkConfig, producing a depth-adjusted copy.
 *
 * Multiplies weight by resolved weight, density by resolved density.
 * The caller should apply resolved opacity to the output marks.
 */
export function applyDepthToMarkConfig(
  base: MarkConfig,
  depth: number,
  config: AtmosphericDepthConfig,
): { config: MarkConfig; opacity: number } {
  const resolved = resolveDepth(depth, config);
  return {
    config: {
      ...base,
      weight: base.weight * (resolved.weight / config.weight.near),
      density: base.density * (resolved.density / config.density.near),
    },
    opacity: resolved.opacity,
  };
}

/**
 * Apply atmospheric depth to a FillConfig, producing a depth-adjusted copy.
 */
export function applyDepthToFillConfig(
  base: FillConfig,
  depth: number,
  config: AtmosphericDepthConfig,
): { config: FillConfig; opacity: number } {
  const resolved = resolveDepth(depth, config);
  return {
    config: {
      ...base,
      weight: base.weight * (resolved.weight / config.weight.near),
      density: base.density * (resolved.density / config.density.near),
    },
    opacity: resolved.opacity,
  };
}

/**
 * Apply resolved opacity to an array of marks.
 * Returns new marks with opacity scaled by the depth factor.
 */
export function applyDepthToMarks(
  marks: readonly { points: readonly { x: number; y: number }[]; width: number; opacity: number }[],
  opacity: number,
): typeof marks {
  if (opacity >= 1) return marks;
  return marks.map(m => ({
    ...m,
    opacity: m.opacity * opacity,
  }));
}

// ── Presets ──────────────────────────────────────────────

/** Standard atmospheric depth — moderate falloff for general illustration. */
export const DEPTH_STANDARD: AtmosphericDepthConfig = {
  weight: { near: 1, far: 0.3 },
  opacity: { near: 1, far: 0.5 },
  density: { near: 1, far: 0.3 },
  detail: { near: 1, far: 0.4 },
  easing: "linear",
};

/**
 * Dramatic atmospheric depth — strong separation between planes.
 * Foreground is bold (1.3×), background fades aggressively.
 * Ease-out easing keeps foreground bold then drops off sharply
 * so mid and background both feel clearly receded.
 */
export const DEPTH_DRAMATIC: AtmosphericDepthConfig = {
  weight: { near: 1.3, far: 0.1 },
  opacity: { near: 1, far: 0.15 },
  density: { near: 1.3, far: 0.1 },
  detail: { near: 1, far: 0.2 },
  easing: "ease-out",
};

/** Subtle atmospheric depth — gentle falloff, elements remain readable. */
export const DEPTH_SUBTLE: AtmosphericDepthConfig = {
  weight: { near: 1, far: 0.5 },
  opacity: { near: 1, far: 0.5 },
  density: { near: 1, far: 0.4 },
  detail: { near: 1, far: 0.6 },
  easing: "linear",
};

// ── Internal ─────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(range: DepthRange, t: number): number {
  return range.near + (range.far - range.near) * t;
}

function applyEasing(t: number, curve: TaperCurve): number {
  switch (curve) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5
        ? 2 * t * t
        : 1 - 2 * (1 - t) * (1 - t);
    case "linear":
    default:
      return t;
  }
}
