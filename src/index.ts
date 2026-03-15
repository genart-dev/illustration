// ── Core types ──────────────────────────────────────────
export type {
  Point2D,
  Bounds,
  StrokePoint,
  TaperSpec,
  TaperCurve,
  CapStyle,
  StrokeProfile,
  StrokeOutline,
  BranchAttachment,
  MergedJunction,
  Mark,
  MarkConfig,
  MarkStrategy,
  FillConfig,
  FillStrategy,
  DepthRange,
  AtmosphericDepthConfig,
  ResolvedDepth,
} from "./types.js";

// ── Stroke outline generation ───────────────────────────
export {
  generateStrokeOutline,
  generateStrokePolygon,
} from "./outline/stroke-outline.js";

export { taperScale } from "./outline/taper.js";
export { generateCap } from "./outline/cap.js";

// ── Adapters (TurtleSegment / AlgorithmStrokePath → StrokeProfile) ──
export {
  segmentToProfile,
  segmentsToProfiles,
  algorithmPathToProfile,
  type TurtleSegment,
  type AlgorithmStrokePathLike,
} from "./outline/adapters.js";

// ── Junction geometry ────────────────────────────────────
export { mergeYJunction } from "./junction/y-junction.js";
export {
  mergeSegmentTree,
  type MergedBranchOutline,
  type TreeMergeOptions,
} from "./junction/tree-merge.js";
export {
  smoothAtIndex,
  enforceG1AtJunctions,
  tangentDiscontinuity,
  subdivideSharpCorners,
} from "./junction/continuity.js";

// ── Mark strategies ────────────────────────────────────
export { technicalMark } from "./marks/technical.js";
export { inkMark } from "./marks/ink.js";
export { pencilMark } from "./marks/pencil.js";
export { engravingMark } from "./marks/engraving.js";
export { woodcutMark } from "./marks/woodcut.js";
export { brushMark } from "./marks/brush.js";

// ── Atmospheric depth ──────────────────────────────────
export {
  resolveDepth,
  applyDepthToMarkConfig,
  applyDepthToFillConfig,
  applyDepthToMarks,
  DEPTH_STANDARD,
  DEPTH_DRAMATIC,
  DEPTH_SUBTLE,
} from "./depth/resolve.js";

// ── Fill strategies ─────────────────────────────────────
export { hatchFill } from "./fill/hatch.js";
export { crosshatchFill } from "./fill/crosshatch.js";
export { stippleFill } from "./fill/stipple.js";

// ── Stamp adapter (StrokeProfile → stamp renderer input) ────────────────────
export {
  strokeProfileToStamp,
  strokeProfilesToStamps,
  type StampPoint,
  type StampStroke,
  type StrokeToStampOptions,
} from "./stamp/adapter.js";

// ── Utilities ───────────────────────────────────────────
export {
  dist,
  dist2,
  lerp,
  tangent,
  normalLeft,
  normalRight,
  dot,
  cross,
  length,
  normalize,
  add,
  sub,
  scale,
  angle,
  averageTangent,
} from "./util/vec.js";

export {
  buildArcLengthTable,
  cumulativeArcLengths,
  type ArcLengthTable,
} from "./util/arc-length.js";

export { interpolateCatmullRom } from "./util/catmull-rom.js";

export {
  pointInPolygon,
  polygonArea,
  polygonBounds,
  offsetPolygon,
  flattenOutline,
} from "./util/polygon.js";
