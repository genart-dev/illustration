/**
 * Core types for @genart-dev/illustration.
 *
 * These types represent the universal vocabulary for converting structural
 * geometry (centerlines, branch trees) into illustration-quality outlines,
 * marks, and fills.
 */

// ── Geometry Primitives ─────────────────────────────────

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

// ── Stroke Profile (universal input) ────────────────────

/** A point along a stroke centerline with width and optional metadata. */
export interface StrokePoint {
  readonly x: number;
  readonly y: number;
  /** Half-width of the stroke at this point (canvas units). */
  readonly width: number;
  /** Pressure at this point (0–1). Used by mark strategies for variation. */
  readonly pressure?: number;
  /** Semantic depth (0 = trunk/root, higher = tip/leaf). */
  readonly depth?: number;
}

/** Taper specification — how the stroke narrows at its ends. */
export interface TaperSpec {
  /** Taper-in length from the start (canvas units). 0 = no taper. */
  readonly start?: number;
  /** Taper-out length at the end (canvas units). 0 = no taper. */
  readonly end?: number;
  /** Easing curve for taper. Default: "linear". */
  readonly curve?: TaperCurve;
}

export type TaperCurve = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/** End cap style for stroke outlines. */
export type CapStyle = "round" | "flat" | "pointed";

/**
 * A stroke centerline with per-point width — the universal input to
 * outline generation.
 *
 * This is the type that algorithm plugins produce (or that adapters
 * create from TurtleSegment[], AlgorithmStrokePath[], etc.) and that
 * illustration consumes.
 */
export interface StrokeProfile {
  readonly points: readonly StrokePoint[];
  /** Optional taper override. If omitted, width comes solely from per-point values. */
  readonly taper?: TaperSpec;
  /** End cap style. Default: "round". */
  readonly cap?: CapStyle;
}

// ── Stroke Outline (output) ─────────────────────────────

/**
 * A stroke outline — the closed polygon produced by offsetting a
 * centerline by its per-point width.
 *
 * Stored as separate edges for flexibility: renderers can stroke
 * only the left edge, apply different textures to each side, etc.
 */
export interface StrokeOutline {
  /** Left edge points (same direction as centerline). */
  readonly left: readonly Point2D[];
  /** Right edge points (same direction as centerline). */
  readonly right: readonly Point2D[];
  /** Start cap points (connects left-start → right-start). Empty for "flat". */
  readonly startCap: readonly Point2D[];
  /** End cap points (connects right-end → left-end). Empty for "flat". */
  readonly endCap: readonly Point2D[];
}

// ── Branch Junction ─────────────────────────────────────

/** Describes where a child branch attaches to a parent stroke. */
export interface BranchAttachment {
  /** Parent stroke profile. */
  readonly parent: StrokeProfile;
  /** Child stroke profile. */
  readonly child: StrokeProfile;
  /** Parameter t ∈ [0,1] along parent centerline where child starts. */
  readonly t: number;
  /** Angle of child relative to parent tangent (radians, CCW positive). */
  readonly angle: number;
}

/** Result of merging a parent and child branch at a junction. */
export interface MergedJunction {
  /** Outer outline polygon encompassing both branches. */
  readonly outline: readonly Point2D[];
  /** Inner crotch curve points (the smooth junction between branches). */
  readonly crotch: readonly Point2D[];
}

// ── Marks ───────────────────────────────────────────────

/** A single drawn mark — a short stroke, dot, or line segment. */
export interface Mark {
  /** Polyline points of the mark. */
  readonly points: readonly Point2D[];
  /** Line width (canvas units). */
  readonly width: number;
  /** Opacity (0–1). */
  readonly opacity: number;
}

/** Configuration for mark generation strategies. */
export interface MarkConfig {
  /** Mark density (0–1). Higher = more marks / tighter spacing. */
  readonly density: number;
  /** Line weight multiplier. */
  readonly weight: number;
  /** Randomness in mark placement (0–1). */
  readonly jitter: number;
  /** Primary mark direction (radians). Relevant for hatching, engraving. */
  readonly angle?: number;
  /** Number of rendering passes. Some strategies build up marks in layers. */
  readonly passes?: number;
}

/**
 * A mark strategy converts stroke outline geometry into drawing marks.
 *
 * Each strategy embodies a traditional illustration technique: ink lines,
 * pencil sketch strokes, engraving hatching, woodcut gouges, etc.
 */
export interface MarkStrategy {
  readonly id: string;
  readonly name: string;
  /** Generate marks to render a stroke outline. */
  generateMarks(
    outline: StrokeOutline,
    profile: StrokeProfile,
    config: MarkConfig,
    rng: () => number,
  ): Mark[];
}

// ── Fill ────────────────────────────────────────────────

/** Configuration for region fill strategies. */
export interface FillConfig {
  /** Fill density (0–1). Higher = more marks / tighter spacing. */
  readonly density: number;
  /** Line weight for fill marks. */
  readonly weight: number;
  /** Primary hatch direction (radians). */
  readonly angle: number;
  /** Randomness in mark placement (0–1). */
  readonly jitter?: number;
  /** Secondary direction for crosshatch (radians). */
  readonly secondaryAngle?: number;
}

/**
 * A fill strategy generates marks inside a closed polygon region.
 *
 * Strategies include parallel hatching, crosshatching, stipple dots,
 * contour-following lines, and irregular scumble.
 */
export interface FillStrategy {
  readonly id: string;
  readonly name: string;
  /** Generate fill marks inside a closed polygon. */
  generateFill(
    region: readonly Point2D[],
    config: FillConfig,
    rng: () => number,
  ): Mark[];
}
