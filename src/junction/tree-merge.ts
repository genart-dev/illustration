/**
 * Tree-level outline merging — convert TurtleSegment[] into merged branch outlines.
 *
 * Given segments from an L-system engine, this module:
 * 1. Builds an adjacency graph (parent → children by endpoint matching)
 * 2. Converts each branch chain to a StrokeProfile
 * 3. Bottom-up merges: merge leaf branches first, then into parents
 * 4. At each junction, applies Y-junction crotch curve geometry
 *
 * Returns MergedBranchOutline[] — one per connected root branch.
 */

import type {
  StrokeProfile,
  StrokePoint,
  Point2D,
  CapStyle,
  MergedJunction,
} from "../types.js";
import { generateStrokeOutline, generateStrokePolygon } from "../outline/stroke-outline.js";
import { mergeYJunction } from "./y-junction.js";
import { dist, tangent, cross } from "../util/vec.js";
import { cumulativeArcLengths } from "../util/arc-length.js";
import type { TurtleSegment } from "../outline/adapters.js";

/** Result of merging a branch tree into outlines. */
export interface MergedBranchOutline {
  /** Closed polygon outline encompassing the branch (and any merged children). */
  readonly outline: readonly Point2D[];
  /** Crotch curves at each junction (if any children were merged). */
  readonly crotches: readonly (readonly Point2D[])[];
  /** The StrokeProfile used (for mark strategy rendering). */
  readonly profile: StrokeProfile;
  /** Depth of the root segment in this outline. */
  readonly depth: number;
}

/** Options for tree merging. */
export interface TreeMergeOptions {
  /** Width scale multiplier. Default: 1. */
  weightScale?: number;
  /** Maximum depth to generate outlines for. Deeper branches use simple lines.
   *  Default: Infinity (merge all). */
  maxOutlineDepth?: number;
  /** Taper ratio for each segment (end width / start width). Default: 1. */
  taperRatio?: number;
  /** Tip taper length (canvas units). Applied to leaf branches. Default: 0. */
  tipTaper?: number;
  /** Cap style. Default: "round". */
  cap?: CapStyle;
  /** Spatial tolerance for matching segment endpoints. Default: 0.5. */
  tolerance?: number;
}

/**
 * Convert TurtleSegments into merged branch outlines.
 *
 * @param segments All segments from an L-system engine.
 * @param opts Merge configuration.
 * @returns Array of MergedBranchOutline, one per root branch chain.
 */
export function mergeSegmentTree(
  segments: readonly TurtleSegment[],
  opts?: TreeMergeOptions,
): MergedBranchOutline[] {
  if (segments.length === 0) return [];

  const tolerance = opts?.tolerance ?? 0.5;
  const weightScale = opts?.weightScale ?? 1;
  const maxDepth = opts?.maxOutlineDepth ?? Infinity;
  const cap = opts?.cap ?? "round";

  // 1. Build adjacency tree
  const tree = buildSegmentTree(segments, tolerance);

  // 2. Process each root node, collecting all branch outlines
  const results: MergedBranchOutline[] = [];
  for (const root of tree.roots) {
    collectBranchOutlines(root, tree, weightScale, maxDepth, cap, opts, results);
  }

  return results;
}

// ── Internal types ───────────────────────────────────────

interface SegmentNode {
  /** Original segment. */
  segment: TurtleSegment;
  /** Index in the original array. */
  index: number;
  /** Child nodes (branches that start where this segment ends). */
  children: SegmentNode[];
  /** Next node in the same chain (same depth, connected endpoint). */
  next: SegmentNode | null;
  /** Whether this is the first segment in its chain. */
  isChainHead: boolean;
}

interface SegmentTree {
  roots: SegmentNode[];
  nodes: SegmentNode[];
}

// ── Tree building ────────────────────────────────────────

function buildSegmentTree(
  segments: readonly TurtleSegment[],
  tolerance: number,
): SegmentTree {
  const tol2 = tolerance * tolerance;
  const nodes: SegmentNode[] = segments.map((seg, i) => ({
    segment: seg,
    index: i,
    children: [],
    next: null,
    isChainHead: true,
  }));

  // Index nodes by start point
  const byStart = new Map<string, SegmentNode[]>();
  for (const node of nodes) {
    const key = quantize(node.segment.x1, node.segment.y1, tolerance);
    const list = byStart.get(key);
    if (list) list.push(node);
    else byStart.set(key, [node]);
  }

  // Connect: for each segment's endpoint, find segments that start there
  const connected = new Set<number>();
  for (const node of nodes) {
    const key = quantize(node.segment.x2, node.segment.y2, tolerance);
    const candidates = byStart.get(key);
    if (!candidates) continue;

    for (const cand of candidates) {
      if (cand.index === node.index) continue;
      const dx = cand.segment.x1 - node.segment.x2;
      const dy = cand.segment.y1 - node.segment.y2;
      if (dx * dx + dy * dy > tol2) continue;

      if (cand.segment.depth === node.segment.depth) {
        // Same depth → continuation of the same branch chain
        if (!node.next) {
          node.next = cand;
          cand.isChainHead = false;
          connected.add(cand.index);
        }
      } else if (cand.segment.depth > node.segment.depth) {
        // Higher depth → child branch
        node.children.push(cand);
        cand.isChainHead = false;
        connected.add(cand.index);
      }
    }
  }

  // Roots = chain heads that weren't claimed as children
  const roots = nodes.filter((n) => n.isChainHead);

  return { roots, nodes };
}

function quantize(x: number, y: number, tolerance: number): string {
  return `${Math.round(x / tolerance)},${Math.round(y / tolerance)}`;
}

// ── Processing ───────────────────────────────────────────

/**
 * Collect all segments in a chain (same depth, connected endpoints).
 */
function collectChain(head: SegmentNode): TurtleSegment[] {
  const chain: TurtleSegment[] = [];
  let current: SegmentNode | null = head;
  while (current) {
    chain.push(current.segment);
    // Also collect children from intermediate nodes
    current = current.next;
  }
  return chain;
}

/**
 * Collect all children (branches) attached to any segment in a chain.
 */
function collectChildren(head: SegmentNode): SegmentNode[] {
  const children: SegmentNode[] = [];
  let current: SegmentNode | null = head;
  while (current) {
    children.push(...current.children);
    current = current.next;
  }
  return children;
}

/**
 * Convert a chain of segments into a StrokeProfile.
 */
function chainToProfile(
  chain: readonly TurtleSegment[],
  weightScale: number,
  cap: CapStyle,
  isLeaf: boolean,
  opts?: TreeMergeOptions,
): StrokeProfile {
  const points: StrokePoint[] = [];

  // First point
  const first = chain[0]!;
  points.push({
    x: first.x1,
    y: first.y1,
    width: first.width * weightScale * 0.5,
    depth: first.depth,
  });

  // End point of each segment
  let totalLen = 0;
  for (const seg of chain) {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    totalLen += Math.sqrt(dx * dx + dy * dy);
    points.push({
      x: seg.x2,
      y: seg.y2,
      width: seg.width * weightScale * 0.5,
      depth: seg.depth,
    });
  }

  // Limit tip taper to at most 50% of the branch length and ensure
  // the remaining tip width is enough for a visible rounded end.
  let tipTaper = opts?.tipTaper ?? 0;
  if (isLeaf && tipTaper > 0) {
    tipTaper = Math.min(tipTaper, totalLen * 0.5);
    // For very thin branches (width < 3px), skip taper entirely and
    // let the round cap provide a natural taper
    const tipWidth = points[points.length - 1]!.width;
    if (tipWidth < 3) {
      tipTaper = 0;
    }
  }

  return {
    points,
    taper: isLeaf && tipTaper > 0
      ? { end: tipTaper, curve: "ease-out" }
      : undefined,
    cap,
  };
}

/**
 * Process a node and all its descendants, collecting all branch outlines.
 *
 * Each branch chain produces its own MergedBranchOutline (with any
 * immediate children merged via Y-junction). Deeper branches are
 * processed recursively and added to the results array.
 */
function collectBranchOutlines(
  head: SegmentNode,
  tree: SegmentTree,
  weightScale: number,
  maxDepth: number,
  cap: CapStyle,
  opts: TreeMergeOptions | undefined,
  results: MergedBranchOutline[],
): void {
  const chain = collectChain(head);
  const children = collectChildren(head);
  const depth = chain[0]!.depth;

  // Skip if beyond max outline depth
  if (depth > maxDepth) return;

  const isLeaf = children.length === 0;
  const profile = chainToProfile(chain, weightScale, cap, isLeaf, opts);

  // Base case: leaf branch (no children to merge)
  if (isLeaf) {
    const polygon = generateStrokePolygon(profile);
    if (!polygon) return;
    results.push({ outline: polygon, crotches: [], profile, depth });
    return;
  }

  // Non-leaf: merge immediate children via Y-junction, then recurse
  const crotches: Point2D[][] = [];
  let currentOutline = generateStrokePolygon(profile);
  if (!currentOutline) return;

  for (const childHead of children) {
    const childChain = collectChain(childHead);
    const childChildren = collectChildren(childHead);
    const childIsLeaf = childChildren.length === 0;
    const childProfile = chainToProfile(
      childChain, weightScale, cap, childIsLeaf, opts,
    );

    // Find where this child attaches on the parent chain
    const attachInfo = findAttachment(chain, childChain[0]!, profile);
    if (!attachInfo) continue;

    // Merge child into parent via Y-junction
    const junction = mergeYJunction({
      parent: profile,
      child: childProfile,
      t: attachInfo.t,
      angle: attachInfo.angle,
    });

    if (junction) {
      currentOutline = junction.outline.slice();
      crotches.push(junction.crotch.slice());
    }

    // Recursively collect deeper branches
    collectBranchOutlines(childHead, tree, weightScale, maxDepth, cap, opts, results);
  }

  results.push({ outline: currentOutline, crotches, profile, depth });
}

/**
 * Find where a child segment attaches to a parent chain.
 * Returns the attachment parameter t and angle.
 */
function findAttachment(
  parentChain: readonly TurtleSegment[],
  childSeg: TurtleSegment,
  parentProfile: StrokeProfile,
): { t: number; angle: number } | null {
  const childStart = { x: childSeg.x1, y: childSeg.y1 };

  // Find the cumulative arc lengths along the parent chain
  const cumLen = cumulativeArcLengths(parentProfile.points);
  const totalLen = cumLen[cumLen.length - 1]!;
  if (totalLen < 1e-10) return null;

  // Find the closest point on the parent chain to childStart
  let bestDist = Infinity;
  let bestT = 0;
  let bestSegIdx = 0;

  for (let i = 0; i < parentProfile.points.length - 1; i++) {
    const a = parentProfile.points[i]!;
    const b = parentProfile.points[i + 1]!;

    // Project childStart onto segment a→b
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen2 = dx * dx + dy * dy;
    if (segLen2 < 1e-10) continue;

    let localT = ((childStart.x - a.x) * dx + (childStart.y - a.y) * dy) / segLen2;
    localT = Math.max(0, Math.min(1, localT));

    const projX = a.x + localT * dx;
    const projY = a.y + localT * dy;
    const d = Math.sqrt((childStart.x - projX) ** 2 + (childStart.y - projY) ** 2);

    if (d < bestDist) {
      bestDist = d;
      bestSegIdx = i;
      const segStartLen = cumLen[i]!;
      const segEndLen = cumLen[i + 1]!;
      bestT = (segStartLen + localT * (segEndLen - segStartLen)) / totalLen;
    }
  }

  bestT = Math.max(0.01, Math.min(0.99, bestT));

  // Compute attachment angle
  const parentTan = tangent(
    parentProfile.points[bestSegIdx]!,
    parentProfile.points[bestSegIdx + 1]!,
  );
  const childDir = tangent(
    { x: childSeg.x1, y: childSeg.y1 },
    { x: childSeg.x2, y: childSeg.y2 },
  );

  // Angle from parent tangent to child direction
  const angle = Math.atan2(
    cross(parentTan, childDir),
    parentTan.x * childDir.x + parentTan.y * childDir.y,
  );

  return { t: bestT, angle };
}
