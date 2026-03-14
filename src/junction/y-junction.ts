/**
 * Y-junction geometry — merging a child branch outline into a parent.
 *
 * Produces a MergedJunction with a single closed polygon outline
 * encompassing both branches, and a crotch curve at the inner angle.
 *
 * Conventions:
 * - Child angle is CCW from parent tangent (screen-y-down)
 * - cross(parentTan, childDir) > 0 → child forks left
 * - "Fork side" = outer contour side of child
 * - "Crotch side" = inner angle between branches
 */

import type {
  BranchAttachment,
  MergedJunction,
  StrokeProfile,
  StrokeOutline,
  Point2D,
} from "../types.js";
import { generateStrokeOutline } from "../outline/stroke-outline.js";
import { tangent, add, scale, cross, dist } from "../util/vec.js";
import { cumulativeArcLengths } from "../util/arc-length.js";

const CROTCH_SEGMENTS = 8;

/**
 * Merge a child branch into a parent at a Y-junction.
 *
 * @returns MergedJunction or null if either profile has < 2 points.
 */
export function mergeYJunction(attachment: BranchAttachment): MergedJunction | null {
  const { parent, child, t, angle: childAngle } = attachment;

  const parentOutline = generateStrokeOutline(parent);
  const childOutline = generateStrokeOutline(child);
  if (!parentOutline || !childOutline) return null;

  const parentTan = evaluateTangentAt(parent, t);
  const childDir = rotateVec(parentTan, childAngle);
  const forksLeft = cross(parentTan, childDir) > 0;

  const attachIdx = clampIndex(
    Math.round(t * (parentOutline.left.length - 1)),
    parentOutline.left.length,
  );

  return assembleMergedOutline(
    parentOutline, childOutline, attachIdx,
    parentTan, childDir, forksLeft,
  );
}

// ── Helpers ──────────────────────────────────────────────

function evaluateTangentAt(profile: StrokeProfile, t: number): Point2D {
  const { points } = profile;
  if (points.length < 2) return { x: 1, y: 0 };

  const cumLen = cumulativeArcLengths(points);
  const totalLen = cumLen[cumLen.length - 1]!;
  const targetLen = t * totalLen;

  for (let i = 1; i < cumLen.length; i++) {
    if (cumLen[i]! >= targetLen) {
      return tangent(points[i - 1]!, points[i]!);
    }
  }
  return tangent(points[points.length - 2]!, points[points.length - 1]!);
}

function clampIndex(idx: number, length: number): number {
  return Math.max(1, Math.min(length - 2, idx));
}

function rotateVec(v: Point2D, angle: number): Point2D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/**
 * Assemble the merged outline.
 *
 * The standard single-stroke polygon goes:
 *   startCap → left(fwd) → endCap → right(rev)
 *
 * The child creates a "bulge" off one of the parent's edges at attachIdx.
 * On the fork side, we detour through the child's outer edge.
 * The crotch curve fills the inner angle between branches.
 *
 * ForksLeft — the bulge is on the LEFT edge:
 *   startCap →
 *   parentLeft[0..aIdx] →
 *   childLeft[0..end] → childEndCap → childRight[end..0] →
 *   crotchCurve(childRight[0] → parentLeft[aIdx]) →
 *   parentLeft[aIdx..end] →
 *   endCap →
 *   parentRight[end..0]
 *
 * ForksRight — the bulge is on the RIGHT edge (traversed reversed):
 *   startCap →
 *   parentLeft[0..end] →
 *   endCap →
 *   parentRight[end..aIdx] →
 *   childRight[0..end] → childEndCap → childLeft[end..0] →
 *   crotchCurve(childLeft[0] → parentRight[aIdx]) →
 *   parentRight[aIdx..0]
 *
 * Note: the crotch connects the child's inner base back to where
 * the parent's fork-side edge continues. It touches the same parent
 * edge point at attachIdx, creating a self-touching polygon vertex.
 * This is geometrically correct — filled with nonzero winding, it
 * renders as a single merged shape.
 */
function assembleMergedOutline(
  po: StrokeOutline,
  co: StrokeOutline,
  aIdx: number,
  parentTan: Point2D,
  childDir: Point2D,
  forksLeft: boolean,
): MergedJunction {
  // Child edges: fork side is outer, crotch side is inner
  const childFork = forksLeft ? co.left : co.right;
  const childCrotch = forksLeft ? co.right : co.left;
  // Parent fork-side edge (where the split happens)
  const parentFork = forksLeft ? po.left : po.right;

  const crotchCurve = computeCrotchCurve(
    childCrotch[0]!,      // child inner base
    parentFork[aIdx]!,     // parent fork-side at junction
    childDir,
    parentTan,
  );

  const outline: Point2D[] = [];
  const push = (p: Point2D) => outline.push(p);
  const pushAll = (pts: readonly Point2D[]) => { for (const p of pts) push(p); };
  const pushRange = (pts: readonly Point2D[], from: number, to: number) => {
    if (from <= to) {
      for (let i = from; i <= to; i++) push(pts[i]!);
    } else {
      for (let i = from; i >= to; i--) push(pts[i]!);
    }
  };
  const pushReversed = (pts: readonly Point2D[]) => {
    for (let i = pts.length - 1; i >= 0; i--) push(pts[i]!);
  };

  pushAll(po.startCap);

  if (forksLeft) {
    pushRange(po.left, 0, aIdx);         // parent left pre-junction
    pushAll(childFork);                    // child left (outer, fwd)
    pushAll(co.endCap);                    // child end cap
    pushReversed(childCrotch);             // child right (inner, rev)
    pushAll(crotchCurve);                  // crotch: childRight[0] → parentLeft[aIdx]
    pushRange(po.left, aIdx, po.left.length - 1);  // parent left post-junction
    pushAll(po.endCap);                    // parent end cap
    pushReversed(po.right);                // parent right (rev)
  } else {
    pushAll(po.left);                      // parent left fully (fwd)
    pushAll(po.endCap);                    // parent end cap
    pushRange(po.right, po.right.length - 1, aIdx); // parent right post-junction (rev)
    pushAll(childFork);                    // child right (outer, fwd)
    pushAll(co.endCap);                    // child end cap
    pushReversed(childCrotch);             // child left (inner, rev)
    pushAll(crotchCurve);                  // crotch: childLeft[0] → parentRight[aIdx]
    pushRange(po.right, aIdx, 0);          // parent right pre-junction (rev)
  }

  return { outline, crotch: crotchCurve };
}

/**
 * Compute the crotch curve from the child's inner base to the parent's
 * fork-side edge at the junction.
 *
 * Uses a cubic bezier with G1-continuous tangent matching:
 * - At the child end: tangent reverses along child direction
 * - At the parent end: tangent follows parent direction
 */
function computeCrotchCurve(
  childInnerBase: Point2D,
  parentForkPt: Point2D,
  childDir: Point2D,
  parentTan: Point2D,
): Point2D[] {
  const d = dist(childInnerBase, parentForkPt);
  if (d < 0.5) return [childInnerBase, parentForkPt];

  // Scale control arm length by fork angle — at narrow angles the child
  // direction is nearly parallel to the parent, so long arms overshoot.
  const dotProduct = Math.abs(childDir.x * parentTan.x + childDir.y * parentTan.y);
  // dotProduct ≈ 1 for narrow forks, ≈ 0 for perpendicular
  const angleFactor = 0.15 + 0.3 * (1 - dotProduct);
  const cpDist = d * angleFactor;

  // Child CP: extends opposite to child direction (back toward parent)
  const cp1 = add(childInnerBase, scale(childDir, -cpDist));
  // Parent CP: extends along parent tangent
  const cp2 = add(parentForkPt, scale(parentTan, cpDist));

  return cubicBezierPoints(childInnerBase, cp1, cp2, parentForkPt, CROTCH_SEGMENTS);
}

function cubicBezierPoints(
  p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D,
  segments: number,
): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    pts.push({
      x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
      y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
    });
  }
  return pts;
}
