/**
 * Proof-of-concept: stamp renderer vs MarkStrategy
 *
 * Renders the same S-curve geometry two ways:
 * 1. illustration's MarkStrategy (polyline-based)
 * 2. plugin-painting's stamp renderer (stamp-based)
 *
 * Presets compared: ink-pen, pencil, texture-bristle
 *
 * Usage: npx tsx examples/stamp-vs-marks.ts
 * Output: references/experiment-stamp-vs-marks/*.png
 */

import { createCanvas, type Canvas, ImageData } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Polyfill ImageData for plugin-painting's tip-generator (expects browser global)
(globalThis as any).ImageData = ImageData;

// --- illustration imports ---
import {
  generateStrokeOutline,
  inkMark,
  pencilMark,
  brushMark,
  type StrokeProfile,
  type StrokePoint,
  type Mark,
  type MarkConfig,
} from "../src/index.js";

// --- plugin-painting imports (direct path) ---
import { renderStrokes } from "../../plugin-painting/src/brush/stamp-renderer.js";
import { BRUSH_PRESETS } from "../../plugin-painting/src/brush/presets.js";
import type { BrushStroke, StrokePoint as PaintStrokePoint } from "../../plugin-painting/src/brush/types.js";

// ── Config ───────────────────────────────────────────────

const W = 600;
const H = 200;
const PAD = 40;
const OUT_DIR = join(import.meta.dirname!, "..", "references", "experiment-stamp-vs-marks");
const BG = "#f5f0e8";
const FG = "#1a1a1a";

// ── Helpers ──────────────────────────────────────────────

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

function newCanvas(): Canvas {
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  return c;
}

function addLabel(ctx: CanvasRenderingContext2D, text: string): void {
  ctx.fillStyle = "#666";
  ctx.font = "13px sans-serif";
  ctx.fillText(text, 12, 18);
}

function save(canvas: Canvas, name: string): void {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `${name}.png`);
  writeFileSync(path, canvas.toBuffer("image/png"));
  console.log(`  ${name} → ${path}`);
}

// ── Geometry ─────────────────────────────────────────────

/** S-curve with width/pressure variation (same as bar 12 geometry). */
function sCurveProfile(nPoints = 48): StrokeProfile {
  const points: StrokePoint[] = [];
  for (let i = 0; i <= nPoints; i++) {
    const t = i / nPoints;
    const x = PAD + t * (W - 2 * PAD);
    const y = H / 2 + 40 * Math.sin(t * Math.PI * 2);
    const width = 8 + 16 * Math.sin(t * Math.PI);
    const pressure = 0.3 + 0.7 * Math.sin(t * Math.PI);
    points.push({ x, y, width, pressure });
  }
  return { points, cap: "round" };
}

/** Convert illustration StrokeProfile to plugin-painting BrushStroke. */
function profileToStroke(
  profile: StrokeProfile,
  brushId: string,
  size: number,
): BrushStroke {
  const points: PaintStrokePoint[] = profile.points.map((p) => ({
    x: p.x,
    y: p.y,
    pressure: p.pressure ?? 1,
  }));
  return {
    brushId,
    color: FG,
    size,
    points,
    seed: 42,
  };
}

// ── Mark rendering (from illustration) ───────────────────

function renderMarks(
  ctx: CanvasRenderingContext2D,
  marks: Mark[],
  color = FG,
  bgColor = BG,
): void {
  for (const mark of marks) {
    if (mark.points.length === 0) continue;
    const isGouge = mark.opacity < 0;
    const fillColor = isGouge ? bgColor : color;
    const alpha = isGouge ? 1 : mark.opacity;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (mark.width === 0 && mark.points.length >= 3) {
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(mark.points[0]!.x, mark.points[0]!.y);
      for (let i = 1; i < mark.points.length; i++) {
        ctx.lineTo(mark.points[i]!.x, mark.points[i]!.y);
      }
      ctx.closePath();
      ctx.fill();
    } else if (mark.points.length === 1) {
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(mark.points[0]!.x, mark.points[0]!.y, mark.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
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

// ── Main ─────────────────────────────────────────────────

console.log("Stamp vs Marks experiment\n");

const profile = sCurveProfile();
const outline = generateStrokeOutline(profile);
if (!outline) {
  console.error("Failed to generate outline");
  process.exit(1);
}

const markCfg: MarkConfig = { density: 0.7, weight: 6, jitter: 0.5 };

// --- Comparison 1: Ink ---
{
  // MarkStrategy version
  const c1 = newCanvas();
  const ctx1 = c1.getContext("2d");
  addLabel(ctx1, "inkMark (MarkStrategy — polylines)");
  const marks = inkMark.generateMarks(outline, profile, markCfg, mulberry32(42));
  renderMarks(ctx1, marks);
  save(c1, "01-ink-markstrategy");

  // Stamp renderer version
  const c2 = newCanvas();
  const ctx2 = c2.getContext("2d");
  addLabel(ctx2, "ink-pen (stamp renderer)");
  const stroke = profileToStroke(profile, "ink-pen", 20);
  renderStrokes([stroke], BRUSH_PRESETS, ctx2, { x: 0, y: 0, width: W, height: H }, 42);
  save(c2, "02-ink-stamp");
}

// --- Comparison 2: Pencil ---
{
  const c1 = newCanvas();
  const ctx1 = c1.getContext("2d");
  addLabel(ctx1, "pencilMark (MarkStrategy — polylines)");
  const marks = pencilMark.generateMarks(outline, profile, markCfg, mulberry32(42));
  renderMarks(ctx1, marks);
  save(c1, "03-pencil-markstrategy");

  const c2 = newCanvas();
  const ctx2 = c2.getContext("2d");
  addLabel(ctx2, "pencil (stamp renderer)");
  const stroke = profileToStroke(profile, "pencil", 20);
  renderStrokes([stroke], BRUSH_PRESETS, ctx2, { x: 0, y: 0, width: W, height: H }, 42);
  save(c2, "04-pencil-stamp");
}

// --- Comparison 3: Brush/Bristle ---
{
  const c1 = newCanvas();
  const ctx1 = c1.getContext("2d");
  addLabel(ctx1, "brushMark (MarkStrategy — polylines)");
  const marks = brushMark.generateMarks(outline, profile, markCfg, mulberry32(42));
  renderMarks(ctx1, marks);
  save(c1, "05-brush-markstrategy");

  const c2 = newCanvas();
  const ctx2 = c2.getContext("2d");
  addLabel(ctx2, "texture-bristle (stamp renderer)");
  const stroke = profileToStroke(profile, "texture-bristle", 20);
  renderStrokes([stroke], BRUSH_PRESETS, ctx2, { x: 0, y: 0, width: W, height: H }, 42);
  save(c2, "06-bristle-stamp");
}

// --- Comparison 4: Stamp renderer with width from profile ---
// Use the illustration width profile as stamp size modulation
{
  const c1 = newCanvas();
  const ctx1 = c1.getContext("2d");
  addLabel(ctx1, "ink-pen stamp, size from illustration width profile");
  // Convert width profile to pressure: normalize width to 0-1 range
  const maxW = Math.max(...profile.points.map(p => p.width));
  const minW = Math.min(...profile.points.map(p => p.width));
  const widthPoints: PaintStrokePoint[] = profile.points.map(p => ({
    x: p.x,
    y: p.y,
    pressure: maxW > minW ? (p.width - minW) / (maxW - minW) : 1,
  }));
  const stroke: BrushStroke = {
    brushId: "ink-pen",
    color: FG,
    size: maxW * 2, // use max width as base size, pressure scales down
    points: widthPoints,
    seed: 42,
  };
  renderStrokes([stroke], BRUSH_PRESETS, ctx1, { x: 0, y: 0, width: W, height: H }, 42);
  save(c1, "07-ink-stamp-width-profile");
}

// --- Comparison 5: Multiple presets on same curve ---
{
  const presetIds = ["round-hard", "round-soft", "pencil", "ink-pen", "charcoal-stick", "texture-bristle"];
  const cellW = W / 3;
  const cellH = H;
  const rows = 2;
  const cols = 3;
  const fullW = cols * cellW;
  const fullH = rows * cellH;

  const c = createCanvas(fullW, fullH);
  const ctx = c.getContext("2d");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, fullW, fullH);

  for (let i = 0; i < presetIds.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const ox = col * cellW;
    const oy = row * cellH;

    // Draw cell border
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, cellW, cellH);

    // Label
    ctx.fillStyle = "#666";
    ctx.font = "11px sans-serif";
    ctx.fillText(presetIds[i]!, ox + 8, oy + 16);

    // Build stroke in local cell coordinates, then offset
    const cellProfile = sCurveProfile(48);
    const maxW = Math.max(...cellProfile.points.map(p => p.width));
    const minW = Math.min(...cellProfile.points.map(p => p.width));

    const points: PaintStrokePoint[] = cellProfile.points.map(p => ({
      x: ox + (p.x - PAD) * (cellW - 20) / (W - 2 * PAD) + 10,
      y: oy + (p.y - H / 2 + 40) * (cellH - 40) / 80 + 20,
      pressure: maxW > minW ? (p.width - minW) / (maxW - minW) : 1,
    }));

    const stroke: BrushStroke = {
      brushId: presetIds[i]!,
      color: FG,
      size: 16,
      points,
      seed: 42,
    };

    renderStrokes([stroke], BRUSH_PRESETS, ctx, { x: 0, y: 0, width: fullW, height: fullH }, 42);
  }

  save(c, "08-all-presets-grid");
}

console.log("\nDone.");
