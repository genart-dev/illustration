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
      addLabel(before, "Bar 5: Before — lineJoin spike");
      renderBefore(before, profile);
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
      addLabel(after, "Bar 18: After — hatchFill at 45°");
      const config: FillConfig = { density: 0.6, weight: 0.8, angle: Math.PI / 4 };
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
