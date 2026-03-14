/**
 * Render quality bar comparison images for @genart-dev/illustration.
 *
 * Generates before/after PNGs for each quality bar defined in QUALITY.md.
 * "Before" = raw canvas lineTo/lineWidth rendering.
 * "After"  = illustration pipeline (outlines → marks).
 *
 * Usage: npx tsx examples/render-bars.ts
 * Output: references/phase-{n}-{group}/bar-{nn}/before.png, after.png
 */

import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  generateStrokeOutline,
  generateStrokePolygon,
  mergeYJunction,
  mergeSegmentTree,
  technicalMark,
  inkMark,
  pencilMark,
  engravingMark,
  woodcutMark,
  brushMark,
  hatchFill,
  crosshatchFill,
  stippleFill,
  type StrokeProfile,
  type StrokePoint,
  type StrokeOutline,
  type Mark,
  type MarkConfig,
  type Point2D,
  type FillConfig,
  type TurtleSegment,
} from "../src/index.js";

// ── Configuration ─────────────────────────────────────────

const W = 600;
const H = 300;
const PAD = 40;
const REFS_DIR = join(import.meta.dirname!, "..", "references");

// Seeded PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Geometry Builders ─────────────────────────────────────

/** Straight horizontal line profile. */
function straightProfile(halfWidth: number): StrokeProfile {
  return {
    points: [
      { x: PAD, y: H / 2, width: halfWidth },
      { x: W - PAD, y: H / 2, width: halfWidth },
    ],
    cap: "flat",
  };
}

/** Tapered profile with start/end taper — needle shape (Bar 2). */
function taperedProfile(halfWidth: number, nPoints = 32): StrokeProfile {
  const len = W - 2 * PAD;
  const points: StrokePoint[] = [];
  for (let i = 0; i <= nPoints; i++) {
    const t = i / nPoints;
    points.push({
      x: PAD + t * len,
      y: H / 2,
      width: halfWidth,
    });
  }
  return {
    points,
    taper: { start: len * 0.4, end: len * 0.6, curve: "ease-in-out" },
    cap: "pointed",
  };
}

/** Quarter-circle arc (Bar 3). */
function arcProfile(halfWidth: number, nPoints = 16): StrokeProfile {
  const cx = W / 2;
  const cy = H / 2;
  const r = 100;
  const points: StrokePoint[] = [];
  for (let i = 0; i <= nPoints; i++) {
    const angle = (Math.PI / 2) * (i / nPoints);
    points.push({
      x: cx - r + r * Math.cos(angle),
      y: cy + r - r * Math.sin(angle),
      width: halfWidth,
    });
  }
  return { points, cap: "round" };
}

/** S-curve with width variation (Bar 4). */
function sCurveProfile(nPoints = 32): StrokeProfile {
  const points: StrokePoint[] = [];
  for (let i = 0; i <= nPoints; i++) {
    const t = i / nPoints;
    const x = PAD + t * (W - 2 * PAD);
    const y = H / 2 + 60 * Math.sin(t * Math.PI * 2);
    const width = 2 + 10 * Math.sin(t * Math.PI);
    points.push({ x, y, width });
  }
  return { points, cap: "round" };
}

/** V-shape at a given angle (Bar 5). */
function vShapeProfile(angleDeg: number, halfWidth: number): StrokeProfile {
  const angleRad = (angleDeg * Math.PI) / 180;
  const armLen = 120;
  const cx = W / 2;
  const cy = H / 2 + 40;
  const leftX = cx - armLen * Math.sin(angleRad / 2);
  const leftY = cy - armLen * Math.cos(angleRad / 2);
  const rightX = cx + armLen * Math.sin(angleRad / 2);
  const rightY = cy - armLen * Math.cos(angleRad / 2);
  return {
    points: [
      { x: leftX, y: leftY, width: halfWidth },
      { x: cx, y: cy, width: halfWidth },
      { x: rightX, y: rightY, width: halfWidth },
    ],
    cap: "round",
  };
}

/** S-curve for mark strategies (Bars 12-17) — more points for better marks. */
function marksCurveProfile(depth = 0, nPoints = 48): StrokeProfile {
  const points: StrokePoint[] = [];
  for (let i = 0; i <= nPoints; i++) {
    const t = i / nPoints;
    const x = PAD + t * (W - 2 * PAD);
    const y = H / 2 + 50 * Math.sin(t * Math.PI * 2);
    // Wider strokes so mark character is visible
    const width = 8 + 16 * Math.sin(t * Math.PI);
    const pressure = 0.3 + 0.7 * Math.sin(t * Math.PI);
    points.push({ x, y, width, depth, pressure });
  }
  return { points, cap: "round" };
}

/** Create a Y-fork: parent going right, child forking at given angle (Bars 7-9). */
function yForkProfiles(
  forkAngleDeg: number,
  parentHalfW: number,
  childHalfW: number,
): { parent: StrokeProfile; child: StrokeProfile; t: number; angle: number } {
  const forkAngle = (forkAngleDeg * Math.PI) / 180;
  const parentLen = 300;
  const childLen = 150;
  const forkT = 0.6;

  // Parent: horizontal line
  const px0 = PAD + 50;
  const py0 = H / 2;
  const px1 = px0 + parentLen;
  const py1 = py0;

  const parent: StrokeProfile = {
    points: Array.from({ length: 16 }, (_, i) => ({
      x: px0 + (i / 15) * parentLen,
      y: py0,
      width: parentHalfW,
    })),
    cap: "round",
  };

  // Child: starts at forkT along parent, goes at forkAngle
  const cx0 = px0 + forkT * parentLen;
  const cy0 = py0;
  const child: StrokeProfile = {
    points: Array.from({ length: 12 }, (_, i) => ({
      x: cx0 + (i / 11) * childLen * Math.cos(forkAngle),
      y: cy0 - (i / 11) * childLen * Math.sin(forkAngle),
      width: childHalfW * (1 - i / 11 * 0.3),
    })),
    cap: "round",
  };

  return { parent, child, t: forkT, angle: forkAngle };
}

/** Render segments "before" — raw overlapping strokes. */
function renderSegmentsBefore(
  ctx: CanvasRenderingContext2D,
  segments: readonly TurtleSegment[],
  color = "#1a1a1a",
): void {
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const seg of segments) {
    ctx.lineWidth = seg.width;
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
  }
}

/** Generate a simple L-system tree as TurtleSegments (Bars 10-11). */
function generateTreeSegments(
  x: number, y: number,
  angle: number,
  length: number,
  width: number,
  depth: number,
  maxDepth: number,
  forkAngle: number,
): TurtleSegment[] {
  if (depth > maxDepth || width < 0.5) return [];

  const x2 = x + length * Math.cos(angle);
  const y2 = y + length * Math.sin(angle);
  const seg: TurtleSegment = {
    x1: x, y1: y, x2, y2, width, depth, order: 0,
  };

  const segments: TurtleSegment[] = [seg];

  if (depth < maxDepth) {
    // Left branch
    segments.push(...generateTreeSegments(
      x2, y2, angle - forkAngle,
      length * 0.7, width * 0.65, depth + 1, maxDepth, forkAngle,
    ));
    // Right branch
    segments.push(...generateTreeSegments(
      x2, y2, angle + forkAngle,
      length * 0.7, width * 0.65, depth + 1, maxDepth, forkAngle,
    ));
  }

  return segments;
}

/** Leaf-like oval for fill tests (Bars 18-20). */
function leafPolygon(cx: number, cy: number, rx: number, ry: number, nPoints = 32): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i < nPoints; i++) {
    const angle = (2 * Math.PI * i) / nPoints;
    pts.push({
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    });
  }
  return pts;
}

// ── Canvas Rendering ──────────────────────────────────────

/** Render marks to a canvas context. */
function renderMarks(
  ctx: CanvasRenderingContext2D,
  marks: Mark[],
  color = "#1a1a1a",
  bgColor = "#f5f0e8",
): void {
  for (const mark of marks) {
    if (mark.points.length === 0) continue;

    // Woodcut convention: opacity < 0 means gouge (use background color)
    const isGouge = mark.opacity < 0;
    const fillColor = isGouge ? bgColor : color;
    const alpha = isGouge ? 1 : mark.opacity;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (mark.width === 0 && mark.points.length >= 3) {
      // Filled polygon (woodcut convention)
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(mark.points[0]!.x, mark.points[0]!.y);
      for (let i = 1; i < mark.points.length; i++) {
        ctx.lineTo(mark.points[i]!.x, mark.points[i]!.y);
      }
      ctx.closePath();
      ctx.fill();
    } else if (mark.points.length === 1) {
      // Dot (ink pooling, wet spots)
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(mark.points[0]!.x, mark.points[0]!.y, mark.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Polyline stroke
      ctx.strokeStyle = fillColor;
      ctx.lineWidth = mark.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(mark.points[0]!.x, mark.points[0]!.y);
      for (let i = 1; i < mark.points.length; i++) {
        ctx.lineTo(mark.points[i]!.x, mark.points[i]!.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Render a stroke outline polygon (filled). */
function renderOutline(
  ctx: CanvasRenderingContext2D,
  outline: StrokeOutline,
  color = "#1a1a1a",
): void {
  const poly: Point2D[] = [];
  for (const p of outline.startCap) poly.push(p);
  for (const p of outline.left) poly.push(p);
  for (const p of outline.endCap) poly.push(p);
  for (let i = outline.right.length - 1; i >= 0; i--) poly.push(outline.right[i]!);

  if (poly.length < 3) return;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(poly[0]!.x, poly[0]!.y);
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(poly[i]!.x, poly[i]!.y);
  }
  ctx.closePath();
  ctx.fill();
}

/** "Before" rendering: raw canvas lineTo with constant lineWidth. */
function renderBefore(
  ctx: CanvasRenderingContext2D,
  profile: StrokeProfile,
  color = "#1a1a1a",
): void {
  const { points } = profile;
  if (points.length < 2) return;

  const avgWidth = points.reduce((s, p) => s + p.width, 0) / points.length;

  ctx.strokeStyle = color;
  ctx.lineWidth = avgWidth * 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  ctx.stroke();
}

// ── Bar Renderers ─────────────────────────────────────────

const BG = "#f5f0e8";
const FG = "#1a1a1a";

interface BarSpec {
  id: number;
  name: string;
  group: string;
  render(
    beforeCtx: CanvasRenderingContext2D,
    afterCtx: CanvasRenderingContext2D,
  ): void;
}

function clearCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
}

function addLabel(ctx: CanvasRenderingContext2D, text: string): void {
  ctx.fillStyle = "#666";
  ctx.font = "12px monospace";
  ctx.fillText(text, 8, 16);
}

const bars: BarSpec[] = [
  // ── Phase 1: Outlines (Bars 1-6) ──
  {
    id: 1,
    name: "Straight Stroke, Uniform Width",
    group: "phase-1-outlines",
    render(before, after) {
      const profile = straightProfile(10);
      clearCanvas(before);
      addLabel(before, "Bar 1: Before — lineTo + lineWidth");
      renderBefore(before, profile);
      clearCanvas(after);
      addLabel(after, "Bar 1: After — generateStrokeOutline");
      const outline = generateStrokeOutline(profile);
      if (outline) renderOutline(after, outline);
    },
  },
  {
    id: 2,
    name: "Tapered Stroke",
    group: "phase-1-outlines",
    render(before, after) {
      const profile = taperedProfile(10);
      clearCanvas(before);
      addLabel(before, "Bar 2: Before — uniform lineWidth");
      renderBefore(before, profile);
      clearCanvas(after);
      addLabel(after, "Bar 2: After — tapered outline");
      const outline = generateStrokeOutline(profile);
      if (outline) renderOutline(after, outline);
    },
  },
  {
    id: 3,
    name: "Curved Stroke, Constant Width",
    group: "phase-1-outlines",
    render(before, after) {
      const profile = arcProfile(8);
      clearCanvas(before);
      addLabel(before, "Bar 3: Before — arc with lineWidth");
      renderBefore(before, profile);
      clearCanvas(after);
      addLabel(after, "Bar 3: After — offset outline");
      const outline = generateStrokeOutline(profile);
      if (outline) renderOutline(after, outline);
    },
  },
  {
    id: 4,
    name: "S-Curve with Width Variation",
    group: "phase-1-outlines",
    render(before, after) {
      const profile = sCurveProfile();
      clearCanvas(before);
      addLabel(before, "Bar 4: Before — uniform lineWidth");
      renderBefore(before, profile);
      clearCanvas(after);
      addLabel(after, "Bar 4: After — variable-width outline");
      const outline = generateStrokeOutline(profile);
      if (outline) renderOutline(after, outline);
    },
  },
  {
    id: 5,
    name: "Acute Angle (Miter Limiting)",
    group: "phase-1-outlines",
    render(before, after) {
      const profile = vShapeProfile(30, 6);
      clearCanvas(before);
      addLabel(before, "Bar 5: Before — miter spike at acute join");
      // Use miter lineJoin to show the spike artifact
      const { points } = profile;
      before.strokeStyle = FG;
      before.lineWidth = 12;
      before.lineJoin = "miter";
      before.miterLimit = 20; // high limit → visible spike
      before.lineCap = "round";
      before.beginPath();
      before.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) {
        before.lineTo(points[i]!.x, points[i]!.y);
      }
      before.stroke();
      clearCanvas(after);
      addLabel(after, "Bar 5: After — miter-limited outline");
      const outline = generateStrokeOutline(profile);
      if (outline) renderOutline(after, outline);
    },
  },
  {
    id: 6,
    name: "Three Cap Styles",
    group: "phase-1-outlines",
    render(before, after) {
      clearCanvas(before);
      addLabel(before, "Bar 6: Before — lineCap options");
      const baseProfile: StrokePoint[] = [
        { x: PAD + 60, y: 0, width: 8 },
        { x: W - PAD - 60, y: 0, width: 8 },
      ];

      const caps: Array<{ cap: "round" | "flat" | "pointed"; y: number; label: string }> = [
        { cap: "round", y: H * 0.25, label: "round" },
        { cap: "flat", y: H * 0.5, label: "flat" },
        { cap: "pointed", y: H * 0.75, label: "pointed" },
      ];

      for (const { cap, y, label } of caps) {
        // Before: canvas lineCap
        before.strokeStyle = FG;
        before.lineWidth = 16;
        before.lineCap = cap === "pointed" ? "round" : cap;
        before.beginPath();
        before.moveTo(PAD + 60, y);
        before.lineTo(W - PAD - 60, y);
        before.stroke();
        before.fillStyle = "#888";
        before.font = "11px monospace";
        before.fillText(label, PAD, y + 5);
      }

      clearCanvas(after);
      addLabel(after, "Bar 6: After — generateCap");
      for (const { cap, y } of caps) {
        const profile: StrokeProfile = {
          points: baseProfile.map((p) => ({ ...p, y })),
          cap,
        };
        const outline = generateStrokeOutline(profile);
        if (outline) renderOutline(after, outline);
      }
    },
  },

  // ── Phase 2: Junctions (Bars 7-11) ──
  {
    id: 7,
    name: "Y-Junction (60° Fork)",
    group: "phase-2-junctions",
    render(before, after) {
      const { parent, child, t, angle } = yForkProfiles(60, 12, 8);
      clearCanvas(before);
      addLabel(before, "Bar 7: Before — overlapping strokes");
      renderBefore(before, parent);
      renderBefore(before, child);
      clearCanvas(after);
      addLabel(after, "Bar 7: After — mergeYJunction");
      const junction = mergeYJunction({ parent, child, t, angle });
      if (junction) {
        after.fillStyle = FG;
        after.beginPath();
        after.moveTo(junction.outline[0]!.x, junction.outline[0]!.y);
        for (const p of junction.outline) after.lineTo(p.x, p.y);
        after.closePath();
        after.fill();
      }
    },
  },
  {
    id: 8,
    name: "Narrow-Angle Fork (20°)",
    group: "phase-2-junctions",
    render(before, after) {
      const { parent, child, t, angle } = yForkProfiles(20, 12, 8);
      clearCanvas(before);
      addLabel(before, "Bar 8: Before — overlapping strokes");
      renderBefore(before, parent);
      renderBefore(before, child);
      clearCanvas(after);
      addLabel(after, "Bar 8: After — mergeYJunction (20°)");
      const junction = mergeYJunction({ parent, child, t, angle });
      if (junction) {
        after.fillStyle = FG;
        after.beginPath();
        after.moveTo(junction.outline[0]!.x, junction.outline[0]!.y);
        for (const p of junction.outline) after.lineTo(p.x, p.y);
        after.closePath();
        after.fill();
      }
    },
  },
  {
    id: 9,
    name: "Wide-Angle Fork (150°)",
    group: "phase-2-junctions",
    render(before, after) {
      const { parent, child, t, angle } = yForkProfiles(150, 12, 8);
      clearCanvas(before);
      addLabel(before, "Bar 9: Before — overlapping strokes");
      renderBefore(before, parent);
      renderBefore(before, child);
      clearCanvas(after);
      addLabel(after, "Bar 9: After — mergeYJunction (150°)");
      const junction = mergeYJunction({ parent, child, t, angle });
      if (junction) {
        after.fillStyle = FG;
        after.beginPath();
        after.moveTo(junction.outline[0]!.x, junction.outline[0]!.y);
        for (const p of junction.outline) after.lineTo(p.x, p.y);
        after.closePath();
        after.fill();
      }
    },
  },
  {
    id: 10,
    name: "Multi-Level Tree (Depth 0–4)",
    group: "phase-2-junctions",
    render(before, after) {
      const segments = generateTreeSegments(
        W / 2, H - PAD,   // start at bottom center
        -Math.PI / 2,      // grow upward
        70, 18, 0, 5,      // length, width, depth, maxDepth (more levels)
        Math.PI / 6,        // fork angle (30°, tighter for more visible tips)
      );
      clearCanvas(before);
      addLabel(before, "Bar 10: Before — raw overlapping segments");
      renderSegmentsBefore(before, segments);

      clearCanvas(after);
      addLabel(after, "Bar 10: After — mergeSegmentTree");
      const merged = mergeSegmentTree(segments, { tipTaper: 10 });
      after.fillStyle = FG;
      for (const branch of merged) {
        if (branch.outline.length < 3) continue;
        after.beginPath();
        after.moveTo(branch.outline[0]!.x, branch.outline[0]!.y);
        for (const p of branch.outline) after.lineTo(p.x, p.y);
        after.closePath();
        after.fill();
      }
    },
  },
  {
    id: 11,
    name: "Trunk Base Flare",
    group: "phase-2-junctions",
    render(before, after) {
      // Same tree but with a wider trunk base
      const baseSegments = generateTreeSegments(
        W / 2, H - PAD, -Math.PI / 2,
        70, 18, 0, 4,
        Math.PI / 6,
      );
      // Add a flared base segment
      const flareSegments: TurtleSegment[] = [
        { x1: W / 2, y1: H - PAD + 15, x2: W / 2, y2: H - PAD, width: 24, depth: 0, order: 0 },
        ...baseSegments,
      ];

      clearCanvas(before);
      addLabel(before, "Bar 11: Before — raw segments, no flare");
      renderSegmentsBefore(before, baseSegments);

      clearCanvas(after);
      addLabel(after, "Bar 11: After — merged tree with base flare");
      const merged = mergeSegmentTree(flareSegments, { tipTaper: 8 });
      after.fillStyle = FG;
      for (const branch of merged) {
        if (branch.outline.length < 3) continue;
        after.beginPath();
        after.moveTo(branch.outline[0]!.x, branch.outline[0]!.y);
        for (const p of branch.outline) after.lineTo(p.x, p.y);
        after.closePath();
        after.fill();
      }
    },
  },

  // ── Phase 3: Mark Strategies (Bars 12-17) ──
  {
    id: 12,
    name: "Ink Line",
    group: "phase-3-marks",
    render(before, after) {
      const profile = marksCurveProfile(0);
      const rng = mulberry32(42);
      clearCanvas(before);
      addLabel(before, "Bar 12: Before — raw lineTo");
      renderBefore(before, profile);
      clearCanvas(after);
      addLabel(after, "Bar 12: After — inkMark");
      const outline = generateStrokeOutline(profile);
      if (!outline) return;
      const config: MarkConfig = { density: 0.8, weight: 6, jitter: 0.5 };
      const marks = inkMark.generateMarks(outline, profile, config, rng);
      renderMarks(after, marks, FG, BG);
    },
  },
  {
    id: 13,
    name: "Pencil Sketch",
    group: "phase-3-marks",
    render(before, after) {
      const profile = marksCurveProfile(2);
      const rng = mulberry32(77);
      clearCanvas(before);
      addLabel(before, "Bar 13: Before — raw lineTo");
      renderBefore(before, profile);
      clearCanvas(after);
      addLabel(after, "Bar 13: After — pencilMark (3 passes)");
      const outline = generateStrokeOutline(profile);
      if (!outline) return;
      const config: MarkConfig = { density: 0.7, weight: 4, jitter: 0.8, passes: 3 };
      const marks = pencilMark.generateMarks(outline, profile, config, rng);
      renderMarks(after, marks, FG, BG);
    },
  },
  {
    id: 14,
    name: "Engraving Hatching",
    group: "phase-3-marks",
    render(before, after) {
      const profile = marksCurveProfile(3);
      const rng = mulberry32(314);
      clearCanvas(before);
      addLabel(before, "Bar 14: Before — raw lineTo");
      renderBefore(before, profile);
      clearCanvas(after);
      addLabel(after, "Bar 14: After — engravingMark");
      const outline = generateStrokeOutline(profile);
      if (!outline) return;
      const config: MarkConfig = { density: 0.8, weight: 3, jitter: 0.1 };
      const marks = engravingMark.generateMarks(outline, profile, config, rng);
      renderMarks(after, marks, FG, BG);
    },
  },
  {
    id: 15,
    name: "Woodcut Bold",
    group: "phase-3-marks",
    render(before, after) {
      // Thicker profile for woodcut
      const points: StrokePoint[] = [];
      const nPoints = 32;
      for (let i = 0; i <= nPoints; i++) {
        const t = i / nPoints;
        const x = PAD + t * (W - 2 * PAD);
        const y = H / 2 + 30 * Math.sin(t * Math.PI * 1.5);
        points.push({ x, y, width: 12 + 6 * Math.sin(t * Math.PI), depth: 0 });
      }
      const profile: StrokeProfile = { points, cap: "flat" };
      const rng = mulberry32(666);

      clearCanvas(before);
      addLabel(before, "Bar 15: Before — raw lineTo");
      renderBefore(before, profile);

      clearCanvas(after);
      addLabel(after, "Bar 15: After — woodcutMark");
      const outline = generateStrokeOutline(profile);
      if (!outline) return;
      const config: MarkConfig = { density: 0.7, weight: 4, jitter: 0.3 };
      const marks = woodcutMark.generateMarks(outline, profile, config, rng);
      renderMarks(after, marks, FG, BG);
    },
  },
  {
    id: 16,
    name: "Brush / Sumi-e",
    group: "phase-3-marks",
    render(before, after) {
      const profile = marksCurveProfile(1);
      const rng = mulberry32(88);
      clearCanvas(before);
      addLabel(before, "Bar 16: Before — raw lineTo");
      renderBefore(before, profile);
      clearCanvas(after);
      addLabel(after, "Bar 16: After — brushMark");
      const outline = generateStrokeOutline(profile);
      if (!outline) return;
      const config: MarkConfig = { density: 0.8, weight: 14, jitter: 0.7 };
      const marks = brushMark.generateMarks(outline, profile, config, rng);
      renderMarks(after, marks, FG, BG);
    },
  },
  {
    id: 17,
    name: "Technical Line",
    group: "phase-3-marks",
    render(before, after) {
      const profile = marksCurveProfile(0);
      const rng = mulberry32(1);
      clearCanvas(before);
      addLabel(before, "Bar 17: Before — raw lineTo");
      renderBefore(before, profile);
      clearCanvas(after);
      addLabel(after, "Bar 17: After — technicalMark");
      const outline = generateStrokeOutline(profile);
      if (!outline) return;
      const config: MarkConfig = { density: 1, weight: 3, jitter: 0 };
      const marks = technicalMark.generateMarks(outline, profile, config, rng);
      renderMarks(after, marks, FG, BG);
    },
  },

  // ── Phase 3: Fill Strategies (Bars 18-20) ──
  {
    id: 18,
    name: "Hatch Fill with Tonal Gradient",
    group: "phase-3-fills",
    render(before, after) {
      const region = leafPolygon(W / 2, H / 2, 200, 100);
      const rng = mulberry32(55);

      clearCanvas(before);
      addLabel(before, "Bar 18: Before — solid fill");
      before.fillStyle = FG;
      before.globalAlpha = 0.3;
      before.beginPath();
      before.moveTo(region[0]!.x, region[0]!.y);
      for (const p of region) before.lineTo(p.x, p.y);
      before.closePath();
      before.fill();
      before.globalAlpha = 1;

      clearCanvas(after);
      addLabel(after, "Bar 18: After — hatchFill at 45° with gradient");
      const config: FillConfig = {
        density: 0.8,
        weight: 0.8,
        angle: Math.PI / 4,
        gradient: { angle: Math.PI, strength: 0.95 },
      };
      const marks = hatchFill.generateFill(region, config, rng);
      renderMarks(after, marks, FG, BG);
      // Draw region outline
      after.strokeStyle = FG;
      after.lineWidth = 1;
      after.beginPath();
      after.moveTo(region[0]!.x, region[0]!.y);
      for (const p of region) after.lineTo(p.x, p.y);
      after.closePath();
      after.stroke();
    },
  },
  {
    id: 19,
    name: "Crosshatch Tonal Range",
    group: "phase-3-fills",
    render(before, after) {
      const rng = mulberry32(99);
      clearCanvas(before);
      addLabel(before, "Bar 19: Before — solid fills at different opacities");

      // 5 strips with increasing opacity
      const stripW = (W - 2 * PAD) / 5;
      for (let i = 0; i < 5; i++) {
        const opacity = 0.1 + i * 0.2;
        before.fillStyle = FG;
        before.globalAlpha = opacity;
        before.fillRect(PAD + i * stripW + 4, PAD + 20, stripW - 8, H - 2 * PAD - 20);
      }
      before.globalAlpha = 1;

      clearCanvas(after);
      addLabel(after, "Bar 19: After — crosshatchFill, 5 densities");
      for (let i = 0; i < 5; i++) {
        const density = 0.1 + i * 0.2;
        const sx = PAD + i * stripW + 4;
        const sy = PAD + 20;
        const sw = stripW - 8;
        const sh = H - 2 * PAD - 20;
        const stripRegion: Point2D[] = [
          { x: sx, y: sy },
          { x: sx + sw, y: sy },
          { x: sx + sw, y: sy + sh },
          { x: sx, y: sy + sh },
        ];
        const config: FillConfig = {
          density,
          weight: 0.7,
          angle: 0,
          secondaryAngle: Math.PI / 4,
        };
        const marks = crosshatchFill.generateFill(stripRegion, config, rng);
        renderMarks(after, marks, FG, BG);
        // Strip outline
        after.strokeStyle = "#aaa";
        after.lineWidth = 0.5;
        after.strokeRect(sx, sy, sw, sh);
      }
    },
  },
  {
    id: 20,
    name: "Stipple Dot Distribution",
    group: "phase-3-fills",
    render(before, after) {
      const region = leafPolygon(W / 2, H / 2, 180, 110);
      const rng = mulberry32(123);

      clearCanvas(before);
      addLabel(before, "Bar 20: Before — solid fill");
      before.fillStyle = FG;
      before.globalAlpha = 0.4;
      before.beginPath();
      before.moveTo(region[0]!.x, region[0]!.y);
      for (const p of region) before.lineTo(p.x, p.y);
      before.closePath();
      before.fill();
      before.globalAlpha = 1;

      clearCanvas(after);
      addLabel(after, "Bar 20: After — stippleFill");
      const config: FillConfig = { density: 0.5, weight: 1.5, angle: 0 };
      const marks = stippleFill.generateFill(region, config, rng);
      renderMarks(after, marks, FG, BG);
      // Region outline
      after.strokeStyle = FG;
      after.lineWidth = 1;
      after.beginPath();
      after.moveTo(region[0]!.x, region[0]!.y);
      for (const p of region) after.lineTo(p.x, p.y);
      after.closePath();
      after.stroke();
    },
  },

  // ── Variation Bars (21-28) ──

  // Mark variations — same stroke, different mark strategies side by side
  {
    id: 21,
    name: "Ink Pressure Variations",
    group: "phase-3-marks-variations",
    render(before, after) {
      const rng = mulberry32(200);

      // Three ink strokes at different pressures/weights
      clearCanvas(before);
      addLabel(before, "Bar 21: Before — three raw strokes");
      const profiles: StrokeProfile[] = [];
      for (let row = 0; row < 3; row++) {
        const y = 60 + row * 80;
        const pts: StrokePoint[] = [];
        for (let i = 0; i <= 32; i++) {
          const t = i / 32;
          pts.push({
            x: PAD + 40 + t * (W - 2 * PAD - 80),
            y: y + 20 * Math.sin(t * Math.PI * 3),
            width: [3, 8, 14][row]!,
            pressure: 0.3 + 0.7 * Math.sin(t * Math.PI),
          });
        }
        profiles.push({ points: pts, cap: "round" });
        renderBefore(before, profiles[row]!);
      }

      clearCanvas(after);
      addLabel(after, "Bar 21: After — inkMark at 3 weights");
      const weights = [2, 6, 12];
      const labels = ["fine", "medium", "bold"];
      for (let row = 0; row < 3; row++) {
        const outline = generateStrokeOutline(profiles[row]!);
        if (!outline) continue;
        const config: MarkConfig = { density: 0.8, weight: weights[row]!, jitter: 0.5 };
        const marks = inkMark.generateMarks(outline, profiles[row]!, config, rng);
        renderMarks(after, marks, FG, BG);
        after.fillStyle = "#999";
        after.font = "10px monospace";
        after.fillText(labels[row]!, PAD + 4, 57 + row * 80);
      }
    },
  },
  {
    id: 22,
    name: "Engraving Density Gradient",
    group: "phase-3-marks-variations",
    render(before, after) {
      const rng = mulberry32(300);

      clearCanvas(before);
      addLabel(before, "Bar 22: Before — five raw strokes");

      clearCanvas(after);
      addLabel(after, "Bar 22: After — engravingMark, 5 densities");

      const densities = [0.2, 0.4, 0.6, 0.8, 1.0];
      for (let row = 0; row < 5; row++) {
        const y = 40 + row * 50;
        const pts: StrokePoint[] = [];
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          pts.push({
            x: PAD + 40 + t * (W - 2 * PAD - 80),
            y: y + 10 * Math.sin(t * Math.PI * 2),
            width: 6 + 4 * Math.sin(t * Math.PI),
            depth: row,
          });
        }
        const profile: StrokeProfile = { points: pts, cap: "round" };
        renderBefore(before, profile);

        const outline = generateStrokeOutline(profile);
        if (!outline) continue;
        const config: MarkConfig = { density: densities[row]!, weight: 2, jitter: 0.1 };
        const marks = engravingMark.generateMarks(outline, profile, config, rng);
        renderMarks(after, marks, FG, BG);
        after.fillStyle = "#999";
        after.font = "10px monospace";
        after.fillText(`d=${densities[row]!.toFixed(1)}`, PAD + 4, y - 2);
      }
    },
  },
  {
    id: 23,
    name: "Woodcut Gouge Variations",
    group: "phase-3-marks-variations",
    render(before, after) {
      const rng = mulberry32(400);

      clearCanvas(before);
      addLabel(before, "Bar 23: Before — three raw strokes");

      clearCanvas(after);
      addLabel(after, "Bar 23: After — woodcutMark, 3 jitter levels");

      const jitters = [0.1, 0.4, 0.8];
      const labels = ["tight", "medium", "loose"];
      for (let row = 0; row < 3; row++) {
        const y = 60 + row * 80;
        const pts: StrokePoint[] = [];
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          pts.push({
            x: PAD + 40 + t * (W - 2 * PAD - 80),
            y: y + 15 * Math.sin(t * Math.PI * 1.5),
            width: 10 + 4 * Math.sin(t * Math.PI),
            depth: 0,
          });
        }
        const profile: StrokeProfile = { points: pts, cap: "flat" };
        renderBefore(before, profile);

        const outline = generateStrokeOutline(profile);
        if (!outline) continue;
        const config: MarkConfig = { density: 0.7, weight: 3, jitter: jitters[row]! };
        const marks = woodcutMark.generateMarks(outline, profile, config, rng);
        renderMarks(after, marks, FG, BG);
        after.fillStyle = "#999";
        after.font = "10px monospace";
        after.fillText(labels[row]!, PAD + 4, y - 5);
      }
    },
  },
  {
    id: 24,
    name: "Brush Weight Comparison",
    group: "phase-3-marks-variations",
    render(before, after) {
      const rng = mulberry32(500);

      clearCanvas(before);
      addLabel(before, "Bar 24: Before — three gestural strokes");

      clearCanvas(after);
      addLabel(after, "Bar 24: After — brushMark, fine/medium/bold");

      const weights = [4, 10, 20];
      const labels = ["fine", "medium", "bold"];
      for (let row = 0; row < 3; row++) {
        const y = 60 + row * 80;
        const pts: StrokePoint[] = [];
        for (let i = 0; i <= 36; i++) {
          const t = i / 36;
          pts.push({
            x: PAD + 20 + t * (W - 2 * PAD - 40),
            y: y + 25 * Math.sin(t * Math.PI * 2.5),
            width: weights[row]! * 0.5,
            pressure: 0.3 + 0.7 * Math.sin(t * Math.PI),
            depth: 1,
          });
        }
        const profile: StrokeProfile = { points: pts, cap: "round" };
        renderBefore(before, profile);

        const outline = generateStrokeOutline(profile);
        if (!outline) continue;
        const config: MarkConfig = { density: 0.8, weight: weights[row]!, jitter: 0.6 };
        const marks = brushMark.generateMarks(outline, profile, config, rng);
        renderMarks(after, marks, FG, BG);
        after.fillStyle = "#999";
        after.font = "10px monospace";
        after.fillText(labels[row]!, PAD + 4, y - 8);
      }
    },
  },

  // Fill variations
  {
    id: 25,
    name: "Hatch Angle Comparison",
    group: "phase-3-fills-variations",
    render(before, after) {
      const rng = mulberry32(600);
      const stripW = (W - 2 * PAD) / 4;

      clearCanvas(before);
      addLabel(before, "Bar 25: Before — solid fills");
      for (let i = 0; i < 4; i++) {
        before.fillStyle = FG;
        before.globalAlpha = 0.3;
        before.fillRect(PAD + i * stripW + 4, PAD + 20, stripW - 8, H - 2 * PAD - 20);
      }
      before.globalAlpha = 1;

      clearCanvas(after);
      addLabel(after, "Bar 25: After — hatchFill at 0°/30°/45°/90°");
      const angles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 2];
      const labels = ["0°", "30°", "45°", "90°"];
      for (let i = 0; i < 4; i++) {
        const sx = PAD + i * stripW + 4;
        const sy = PAD + 20;
        const sw = stripW - 8;
        const sh = H - 2 * PAD - 20;
        const stripRegion: Point2D[] = [
          { x: sx, y: sy },
          { x: sx + sw, y: sy },
          { x: sx + sw, y: sy + sh },
          { x: sx, y: sy + sh },
        ];
        const config: FillConfig = { density: 0.6, weight: 0.7, angle: angles[i]! };
        const marks = hatchFill.generateFill(stripRegion, config, rng);
        renderMarks(after, marks, FG, BG);
        after.strokeStyle = "#aaa";
        after.lineWidth = 0.5;
        after.strokeRect(sx, sy, sw, sh);
        after.fillStyle = "#999";
        after.font = "10px monospace";
        after.fillText(labels[i]!, sx + 4, sy - 4);
      }
    },
  },
  {
    id: 26,
    name: "Crosshatch with Gradient",
    group: "phase-3-fills-variations",
    render(before, after) {
      const rng = mulberry32(700);
      const region = leafPolygon(W / 2, H / 2, 200, 100);

      clearCanvas(before);
      addLabel(before, "Bar 26: Before — solid gradient in oval");
      // Draw the oval outline and fill with gradient
      before.save();
      before.beginPath();
      before.moveTo(region[0]!.x, region[0]!.y);
      for (const p of region) before.lineTo(p.x, p.y);
      before.closePath();
      before.clip();
      for (let x = PAD; x < W - PAD; x += 3) {
        const t = (x - PAD) / (W - 2 * PAD);
        before.fillStyle = FG;
        before.globalAlpha = 0.05 + t * 0.45;
        before.fillRect(x, 0, 3, H);
      }
      before.restore();
      before.globalAlpha = 1;
      before.strokeStyle = FG;
      before.lineWidth = 1;
      before.beginPath();
      before.moveTo(region[0]!.x, region[0]!.y);
      for (const p of region) before.lineTo(p.x, p.y);
      before.closePath();
      before.stroke();

      clearCanvas(after);
      addLabel(after, "Bar 26: After — crosshatchFill with gradient");
      const config: FillConfig = {
        density: 0.7,
        weight: 0.6,
        angle: Math.PI / 6,
        secondaryAngle: -Math.PI / 6,
        gradient: { angle: 0, strength: 0.9 },
      };
      const marks = crosshatchFill.generateFill(region, config, rng);
      renderMarks(after, marks, FG, BG);
      after.strokeStyle = FG;
      after.lineWidth = 1;
      after.beginPath();
      after.moveTo(region[0]!.x, region[0]!.y);
      for (const p of region) after.lineTo(p.x, p.y);
      after.closePath();
      after.stroke();
    },
  },
  {
    id: 27,
    name: "Stipple Density Comparison",
    group: "phase-3-fills-variations",
    render(before, after) {
      const rng = mulberry32(800);

      // Three separate oval regions side by side
      const ovals = [
        leafPolygon(W * 0.2, H / 2, 80, 100),
        leafPolygon(W * 0.5, H / 2, 80, 100),
        leafPolygon(W * 0.8, H / 2, 80, 100),
      ];
      const densities = [0.2, 0.5, 0.9];

      clearCanvas(before);
      addLabel(before, "Bar 27: Before — solid fills at 3 opacities");
      for (let i = 0; i < 3; i++) {
        before.fillStyle = FG;
        before.globalAlpha = densities[i]! * 0.5;
        before.beginPath();
        before.moveTo(ovals[i]![0]!.x, ovals[i]![0]!.y);
        for (const p of ovals[i]!) before.lineTo(p.x, p.y);
        before.closePath();
        before.fill();
      }
      before.globalAlpha = 1;

      clearCanvas(after);
      addLabel(after, "Bar 27: After — stippleFill, 3 densities");
      for (let i = 0; i < 3; i++) {
        const config: FillConfig = {
          density: densities[i]!,
          weight: 1.2,
          angle: 0,
        };
        const marks = stippleFill.generateFill(ovals[i]!, config, rng);
        renderMarks(after, marks, FG, BG);
        after.strokeStyle = "#bbb";
        after.lineWidth = 0.5;
        after.beginPath();
        after.moveTo(ovals[i]![0]!.x, ovals[i]![0]!.y);
        for (const p of ovals[i]!) after.lineTo(p.x, p.y);
        after.closePath();
        after.stroke();
        after.fillStyle = "#999";
        after.font = "10px monospace";
        after.fillText(`${densities[i]!}`, W * (0.2 + i * 0.3) - 12, H / 2 + 110);
      }
    },
  },
  {
    id: 28,
    name: "All Six Mark Strategies",
    group: "phase-3-marks-variations",
    render(before, after) {
      const rng = mulberry32(999);

      clearCanvas(before);
      addLabel(before, "Bar 28: Before — same raw stroke ×6");

      clearCanvas(after);
      addLabel(after, "Bar 28: After — technical/ink/pencil/engraving/woodcut/brush");

      const strategies = [technicalMark, inkMark, pencilMark, engravingMark, woodcutMark, brushMark];
      const stratLabels = ["tech", "ink", "pencil", "engrave", "woodcut", "brush"];
      const cols = 3;
      const rows = 2;
      const cellW = (W - 2 * PAD) / cols;
      const cellH = (H - PAD - 20) / rows;

      for (let s = 0; s < strategies.length; s++) {
        const col = s % cols;
        const row = Math.floor(s / cols);
        const cx = PAD + col * cellW + cellW / 2;
        const cy = 30 + row * cellH + cellH / 2;

        // Build a small S-curve in each cell
        const pts: StrokePoint[] = [];
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          pts.push({
            x: cx - cellW * 0.35 + t * cellW * 0.7,
            y: cy + 15 * Math.sin(t * Math.PI * 2),
            width: 3 + 5 * Math.sin(t * Math.PI),
            depth: 2,
            pressure: 0.3 + 0.7 * Math.sin(t * Math.PI),
          });
        }
        const profile: StrokeProfile = {
          points: pts,
          cap: s === 4 ? "flat" : "round", // woodcut gets flat
        };

        // Before: raw stroke
        before.strokeStyle = FG;
        before.lineWidth = 6;
        before.lineCap = "round";
        before.beginPath();
        before.moveTo(pts[0]!.x, pts[0]!.y);
        for (const p of pts) before.lineTo(p.x, p.y);
        before.stroke();
        before.fillStyle = "#999";
        before.font = "10px monospace";
        before.fillText(stratLabels[s]!, cx - cellW * 0.35, cy - 25);

        // After: mark strategy
        const outline = generateStrokeOutline(profile);
        if (!outline) continue;
        const config: MarkConfig = {
          density: 0.7,
          weight: s === 5 ? 10 : 4,
          jitter: 0.5,
          passes: s === 2 ? 3 : undefined,
        };
        const marks = strategies[s]!.generateMarks(outline, profile, config, rng);
        renderMarks(after, marks, FG, BG);
        after.fillStyle = "#999";
        after.font = "10px monospace";
        after.fillText(stratLabels[s]!, cx - cellW * 0.35, cy - 25);
      }
    },
  },

  // ── Atmospheric Depth Bars (29-31) ──

  {
    id: 29,
    name: "Ink at Three Distances",
    group: "phase-4-depth",
    render(before, after) {
      const rng = mulberry32(1100);

      clearCanvas(before);
      addLabel(before, "Bar 29: Before — same branch, uniform weight");

      clearCanvas(after);
      addLabel(after, "Bar 29: After — ink at foreground/mid/background");

      const distances = [
        { label: "foreground", weight: 8, opacity: 1.0, widthScale: 1.0, y: 55 },
        { label: "midground", weight: 4, opacity: 0.6, widthScale: 0.6, y: 145 },
        { label: "background", weight: 1.5, opacity: 0.3, widthScale: 0.3, y: 235 },
      ];

      for (const d of distances) {
        const pts: StrokePoint[] = [];
        for (let i = 0; i <= 32; i++) {
          const t = i / 32;
          pts.push({
            x: PAD + 60 + t * (W - 2 * PAD - 120),
            y: d.y + 20 * Math.sin(t * Math.PI * 2),
            width: 4 * d.widthScale,
          });
        }
        const profile: StrokeProfile = { points: pts, cap: "round" };

        // Before: same weight for all
        before.strokeStyle = FG;
        before.lineWidth = 8;
        before.lineCap = "round";
        before.beginPath();
        before.moveTo(pts[0]!.x, pts[0]!.y);
        for (const p of pts) before.lineTo(p.x, p.y);
        before.stroke();
        before.fillStyle = "#999";
        before.font = "10px monospace";
        before.fillText(d.label, PAD + 4, d.y - 5);

        // After: distance-modulated
        const outline = generateStrokeOutline(profile);
        if (!outline) continue;
        const config: MarkConfig = {
          density: 0.8,
          weight: d.weight,
          jitter: 0.4,
        };
        const marks = inkMark.generateMarks(outline, profile, config, rng);
        // Apply distance-based opacity
        const fadedMarks = marks.map(m => ({
          ...m,
          opacity: m.opacity * d.opacity,
        }));
        renderMarks(after, fadedMarks, FG, BG);
        after.fillStyle = "#999";
        after.font = "10px monospace";
        after.fillText(d.label, PAD + 4, d.y - 5);
      }
    },
  },
  {
    id: 30,
    name: "Engraving at Three Distances",
    group: "phase-4-depth",
    render(before, after) {
      const rng = mulberry32(1200);

      clearCanvas(before);
      addLabel(before, "Bar 30: Before — same oval, uniform fill");

      clearCanvas(after);
      addLabel(after, "Bar 30: After — engraving hatching, 3 distances");

      const distances = [
        { label: "fg", density: 0.9, weight: 1.2, opacity: 1.0, x: W * 0.2 },
        { label: "mid", density: 0.5, weight: 0.8, opacity: 0.6, x: W * 0.5 },
        { label: "bg", density: 0.2, weight: 0.4, opacity: 0.25, x: W * 0.8 },
      ];

      for (const d of distances) {
        const region = leafPolygon(d.x, H / 2, 75, 95);

        // Before: same solid fill
        before.fillStyle = FG;
        before.globalAlpha = 0.3;
        before.beginPath();
        before.moveTo(region[0]!.x, region[0]!.y);
        for (const p of region) before.lineTo(p.x, p.y);
        before.closePath();
        before.fill();
        before.globalAlpha = 1;

        // After: distance-modulated hatching
        const config: FillConfig = {
          density: d.density,
          weight: d.weight,
          angle: Math.PI / 4,
        };
        const marks = hatchFill.generateFill(region, config, rng);
        const fadedMarks = marks.map(m => ({
          ...m,
          opacity: m.opacity * d.opacity,
        }));
        renderMarks(after, fadedMarks, FG, BG);
        // Outline at distance-appropriate weight
        after.strokeStyle = FG;
        after.globalAlpha = d.opacity;
        after.lineWidth = d.weight;
        after.beginPath();
        after.moveTo(region[0]!.x, region[0]!.y);
        for (const p of region) after.lineTo(p.x, p.y);
        after.closePath();
        after.stroke();
        after.globalAlpha = 1;
        after.fillStyle = "#999";
        after.font = "10px monospace";
        after.fillText(d.label, d.x - 8, H / 2 + 110);
      }
    },
  },
  {
    id: 31,
    name: "Tree at Three Distances",
    group: "phase-4-depth",
    render(before, after) {
      const rng = mulberry32(1300);

      clearCanvas(before);
      addLabel(before, "Bar 31: Before — same tree, uniform weight");

      clearCanvas(after);
      addLabel(after, "Bar 31: After — tree outline, 3 distances");

      const distances = [
        { label: "fg", scale: 1.0, weightScale: 1.0, opacity: 1.0, x: W * 0.18 },
        { label: "mid", scale: 0.65, weightScale: 0.5, opacity: 0.55, x: W * 0.5 },
        { label: "bg", scale: 0.35, weightScale: 0.2, opacity: 0.2, x: W * 0.82 },
      ];

      for (const d of distances) {
        const treeY = H - PAD;
        const len = 50 * d.scale;
        const w = 12 * d.scale;
        const maxD = d.scale > 0.6 ? 4 : d.scale > 0.3 ? 3 : 2;

        const segments = generateTreeSegments(
          d.x, treeY, -Math.PI / 2,
          len, w, 0, maxD,
          Math.PI / 5,
        );

        // Before: same weight for all
        renderSegmentsBefore(before, segments);
        before.fillStyle = "#999";
        before.font = "10px monospace";
        before.fillText(d.label, d.x - 8, PAD + 10);

        // After: distance-modulated outlines
        const merged = mergeSegmentTree(segments, {
          weightScale: d.weightScale,
          tipTaper: 6 * d.scale,
        });
        after.fillStyle = FG;
        after.globalAlpha = d.opacity;
        for (const branch of merged) {
          if (branch.outline.length < 3) continue;
          after.beginPath();
          after.moveTo(branch.outline[0]!.x, branch.outline[0]!.y);
          for (const p of branch.outline) after.lineTo(p.x, p.y);
          after.closePath();
          after.fill();
        }
        after.globalAlpha = 1;
        after.fillStyle = "#999";
        after.font = "10px monospace";
        after.fillText(d.label, d.x - 8, PAD + 10);
      }
    },
  },
];

// ── Main ──────────────────────────────────────────────────

function main(): void {
  console.log(`Rendering ${bars.length} quality bars...`);

  for (const bar of bars) {
    const barDir = join(REFS_DIR, bar.group, `bar-${String(bar.id).padStart(2, "0")}`);
    mkdirSync(barDir, { recursive: true });

    const beforeCanvas = createCanvas(W, H);
    const afterCanvas = createCanvas(W, H);
    const beforeCtx = beforeCanvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    const afterCtx = afterCanvas.getContext("2d") as unknown as CanvasRenderingContext2D;

    bar.render(beforeCtx, afterCtx);

    const beforePath = join(barDir, "before.png");
    const afterPath = join(barDir, "after.png");

    writeFileSync(beforePath, (beforeCanvas as any).toBuffer("image/png"));
    writeFileSync(afterPath, (afterCanvas as any).toBuffer("image/png"));

    console.log(`  Bar ${bar.id}: ${bar.name} → ${barDir}`);
  }

  console.log("Done.");
}

main();
