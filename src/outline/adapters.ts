/**
 * Adapters for converting existing structural types into StrokeProfile.
 *
 * These bridge the gap between what algorithm plugins produce today
 * (TurtleSegment[], AlgorithmStrokePath[]) and the universal StrokeProfile
 * input that illustration consumes.
 */

import type { StrokeProfile, StrokePoint, TaperSpec, CapStyle, Point2D } from "../types.js";

// ── TurtleSegment adapter ───────────────────────────────

/**
 * A turtle segment as produced by L-system engines.
 * This mirrors plugin-plants' TurtleSegment type without creating a dependency.
 */
export interface TurtleSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
  readonly depth: number;
  readonly order: number;
}

/**
 * Convert a single TurtleSegment to a two-point StrokeProfile.
 *
 * For a single segment, this is a simple line with width that can
 * optionally taper from start to end based on depth.
 */
export function segmentToProfile(
  seg: TurtleSegment,
  opts?: {
    /** Width multiplier. Default: 1. */
    weightScale?: number;
    /** Taper ratio — end width as fraction of start width. Default: 1 (no taper). */
    taperRatio?: number;
    /** Cap style. Default: "round". */
    cap?: CapStyle;
  },
): StrokeProfile {
  const scale = opts?.weightScale ?? 1;
  const ratio = opts?.taperRatio ?? 1;
  const halfW = seg.width * scale * 0.5;

  return {
    points: [
      { x: seg.x1, y: seg.y1, width: halfW, depth: seg.depth },
      { x: seg.x2, y: seg.y2, width: halfW * ratio, depth: seg.depth },
    ],
    cap: opts?.cap ?? "round",
  };
}

/**
 * Group connected TurtleSegments into polyline chains and convert each to
 * a StrokeProfile with continuous width variation.
 *
 * Segments are connected if one's (x2,y2) matches another's (x1,y1) within
 * a tolerance, and they share the same depth or are adjacent depths in
 * parent-child relationship.
 *
 * @param segments All segments from an L-system engine.
 * @param opts Configuration for width scaling and taper.
 * @returns Array of StrokeProfiles, one per connected branch chain.
 */
export function segmentsToProfiles(
  segments: readonly TurtleSegment[],
  opts?: {
    weightScale?: number;
    /** End-taper length (canvas units). Applied to branch tips. Default: 0. */
    tipTaper?: number;
    cap?: CapStyle;
  },
): StrokeProfile[] {
  if (segments.length === 0) return [];

  const scale = opts?.weightScale ?? 1;
  const tipTaper = opts?.tipTaper ?? 0;
  const cap = opts?.cap ?? "round";
  const tolerance = 0.5;

  // Build adjacency: find chains of connected segments
  const chains = buildChains(segments, tolerance);

  return chains.map((chain) => {
    const points: StrokePoint[] = [];

    // First point of first segment
    const first = chain[0]!;
    points.push({
      x: first.x1,
      y: first.y1,
      width: first.width * scale * 0.5,
      depth: first.depth,
    });

    // End point of each segment
    for (const seg of chain) {
      points.push({
        x: seg.x2,
        y: seg.y2,
        width: seg.width * scale * 0.5,
        depth: seg.depth,
      });
    }

    const taper: TaperSpec | undefined = tipTaper > 0
      ? { end: tipTaper, curve: "ease-out" }
      : undefined;

    return { points, taper, cap };
  });
}

/**
 * Build chains of connected segments.
 * Greedy: pick an unvisited segment, extend forward as far as possible.
 */
function buildChains(
  segments: readonly TurtleSegment[],
  tolerance: number,
): TurtleSegment[][] {
  const tol2 = tolerance * tolerance;
  const visited = new Set<number>();
  const chains: TurtleSegment[][] = [];

  // Index segments by start point for fast lookup
  const byStart = new Map<string, number[]>();
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const key = quantize(seg.x1, seg.y1, tolerance);
    const list = byStart.get(key);
    if (list) list.push(i);
    else byStart.set(key, [i]);
  }

  for (let i = 0; i < segments.length; i++) {
    if (visited.has(i)) continue;
    visited.add(i);

    const chain: TurtleSegment[] = [segments[i]!];

    // Extend forward: find a segment whose start matches our end
    let current = segments[i]!;
    while (true) {
      const key = quantize(current.x2, current.y2, tolerance);
      const candidates = byStart.get(key);
      if (!candidates) break;

      let found = false;
      for (const ci of candidates) {
        if (visited.has(ci)) continue;
        const cand = segments[ci]!;
        const dx = cand.x1 - current.x2;
        const dy = cand.y1 - current.y2;
        if (dx * dx + dy * dy <= tol2) {
          visited.add(ci);
          chain.push(cand);
          current = cand;
          found = true;
          break;
        }
      }
      if (!found) break;
    }

    chains.push(chain);
  }

  return chains;
}

function quantize(x: number, y: number, tolerance: number): string {
  const qx = Math.round(x / tolerance);
  const qy = Math.round(y / tolerance);
  return `${qx},${qy}`;
}

// ── AlgorithmStrokePath adapter ─────────────────────────

/**
 * Mirrors @genart-dev/format's AlgorithmStrokePath without creating a
 * hard dependency. Consumers pass in the format type and it structurally
 * matches.
 */
export interface AlgorithmStrokePathLike {
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly pressure?: readonly number[];
  readonly width?: number;
  readonly depth?: number;
  readonly group?: string;
}

/**
 * Convert an AlgorithmStrokePath to a StrokeProfile.
 *
 * Maps per-point pressure to width variation (pressure 1 = full width,
 * pressure 0 = zero width).
 */
export function algorithmPathToProfile(
  path: AlgorithmStrokePathLike,
  opts?: {
    /** Base half-width if path.width is not set. Default: 1. */
    defaultWidth?: number;
    /** Taper specification. */
    taper?: TaperSpec;
    cap?: CapStyle;
  },
): StrokeProfile {
  const baseW = (path.width ?? opts?.defaultWidth ?? 2) * 0.5;

  const points: StrokePoint[] = path.points.map((pt, i) => {
    const pressure = path.pressure?.[i] ?? 1;
    return {
      x: pt.x,
      y: pt.y,
      width: baseW * pressure,
      depth: path.depth,
      pressure,
    };
  });

  return {
    points,
    taper: opts?.taper,
    cap: opts?.cap ?? "round",
  };
}
