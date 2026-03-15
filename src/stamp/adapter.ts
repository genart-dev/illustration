/**
 * Adapter: StrokeProfile → stamp renderer input.
 *
 * Converts illustration's StrokeProfile (centerline + per-point width) into a
 * StampStroke — a plain data object compatible with plugin-painting's
 * BrushStroke interface. Illustration does not import from plugin-painting;
 * TypeScript structural typing ensures compatibility.
 *
 * Key mapping:
 *   StrokePoint.width (canvas units) → stamp pressure (0–1, normalized)
 *   max(width) * 2                   → BrushStroke.size (base stamp diameter)
 *
 * This drives the stamp renderer's size dynamics, producing the calligraphic
 * thick→thin variation proven in the stamp-vs-marks POC (image 07).
 *
 * Optional atmospheric depth modulation scales the base size and opacity using
 * resolveDepth(), so background strokes automatically render smaller and
 * lighter than foreground strokes.
 */

import type { StrokeProfile, AtmosphericDepthConfig } from "../types.js";
import { resolveDepth } from "../depth/resolve.js";

// ── Output type ──────────────────────────────────────────────────────────────

/** A single point on a stamp path — structurally compatible with
 *  plugin-painting's StrokePoint. */
export interface StampPoint {
  readonly x: number;
  readonly y: number;
  /** Normalized pressure (0–1). Drives stamp size and opacity dynamics. */
  readonly pressure?: number;
}

/**
 * A stamp stroke ready for the stamp renderer — structurally compatible with
 * plugin-painting's BrushStroke interface (duck-typed, no import needed).
 */
export interface StampStroke {
  readonly brushId: string;
  readonly color: string;
  readonly opacity?: number;
  readonly size?: number;
  readonly points: StampPoint[];
  readonly seed?: number;
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface StrokeToStampOptions {
  /** Brush preset ID (e.g. "ink-pen", "pencil", "texture-bristle"). */
  readonly brushId: string;
  /** Stroke color as CSS hex string. Default: "#1a1a1a". */
  readonly color?: string;
  /**
   * Override base stamp size in canvas units.
   *
   * If omitted, derived as `max(point.width) * 2` — the diameter of the
   * widest point on the stroke. This gives the stamp renderer a sensible
   * starting size that it then modulates via pressure dynamics.
   */
  readonly baseSize?: number;
  /** Base opacity for the stroke (0–1). Modulated by depthConfig if provided. */
  readonly opacity?: number;
  /** PRNG seed forwarded to the stamp renderer for scatter/jitter. */
  readonly seed?: number;
  /**
   * Atmospheric depth configuration.
   *
   * When provided together with sceneDepth, modulates the stamp's base size
   * and opacity using resolveDepth(). Background strokes shrink and fade;
   * foreground strokes stay bold.
   */
  readonly depthConfig?: AtmosphericDepthConfig;
  /**
   * Normalized scene depth for this stroke (0 = foreground, 1 = background).
   *
   * Ignored unless depthConfig is also provided. This is the atmospheric
   * depth (where the stroke sits in the scene), distinct from
   * StrokePoint.depth (semantic tree depth: 0 = trunk, higher = tip).
   */
  readonly sceneDepth?: number;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Convert an illustration StrokeProfile to a StampStroke for the stamp renderer.
 *
 * Width profile → pressure mapping:
 *   pressure = (width - minWidth) / (maxWidth - minWidth)
 *
 * This maps the thinnest point to pressure=0 and the thickest to pressure=1,
 * driving the brush's size dynamics to reproduce the original width variation.
 * When all widths are equal, pressure is set to 1 uniformly.
 *
 * @example
 * ```ts
 * const stroke = strokeProfileToStamp(profile, {
 *   brushId: "ink-pen",
 *   color: "#1a1a1a",
 *   depthConfig: DEPTH_STANDARD,
 *   sceneDepth: 0.3,
 * });
 * renderStrokes([stroke], BRUSH_PRESETS, ctx, viewport, seed);
 * ```
 */
export function strokeProfileToStamp(
  profile: StrokeProfile,
  options: StrokeToStampOptions,
): StampStroke {
  const { points } = profile;

  if (points.length === 0) {
    return {
      brushId: options.brushId,
      color: options.color ?? "#1a1a1a",
      seed: options.seed,
      points: [],
    };
  }

  // Compute width range for pressure normalization.
  let minW = Infinity;
  let maxW = -Infinity;
  for (const p of points) {
    if (p.width < minW) minW = p.width;
    if (p.width > maxW) maxW = p.width;
  }
  const widthRange = maxW - minW;

  const stampPoints: StampPoint[] = points.map((p) => ({
    x: p.x,
    y: p.y,
    pressure: widthRange > 0 ? (p.width - minW) / widthRange : 1,
  }));

  // Base size: 2× max half-width = full diameter of the thickest point.
  const baseSize = options.baseSize ?? maxW * 2;

  // Atmospheric depth modulation.
  let finalSize = baseSize;
  let finalOpacity = options.opacity ?? 1;

  if (options.depthConfig !== undefined && options.sceneDepth !== undefined) {
    const resolved = resolveDepth(options.sceneDepth, options.depthConfig);
    const weightRatio = resolved.weight / options.depthConfig.weight.near;
    finalSize = baseSize * weightRatio;
    finalOpacity = finalOpacity * resolved.opacity;
  }

  return {
    brushId: options.brushId,
    color: options.color ?? "#1a1a1a",
    size: finalSize,
    opacity: finalOpacity < 1 ? finalOpacity : undefined,
    points: stampPoints,
    seed: options.seed,
  };
}

/**
 * Convert multiple StrokeProfiles to StampStrokes in one call.
 *
 * All strokes share the same options (brushId, color, depthConfig, etc.).
 * To use different options per stroke, call strokeProfileToStamp() directly.
 */
export function strokeProfilesToStamps(
  profiles: readonly StrokeProfile[],
  options: StrokeToStampOptions,
): StampStroke[] {
  return profiles.map((p) => strokeProfileToStamp(p, options));
}
