/**
 * Stamp vs Marks — v2 (using strokeProfileToStamp adapter)
 *
 * Same geometry as v1, but all stamp conversions go through the new
 * strokeProfileToStamp() adapter instead of the inline profileToStroke()
 * helper. This confirms the adapter produces identical results to v1's
 * manual mapping, and exercises the new depth modulation path.
 *
 * Images produced:
 *   01–06  Same MarkStrategy vs stamp comparisons as v1 (adapter replaces inline code)
 *   07     ink-pen via adapter (replaces v1's manual width→pressure mapping)
 *   08     All presets grid via adapter (same layout as v1 image 08)
 *   09     Depth modulation — ink-pen at 5 scene depths (fg → bg)
 *   10     Depth modulation — all presets at sceneDepth 0 / 0.5 / 1.0
 *   11     Adapter vs v1 inline comparison — confirms equivalence
 *
 * Usage: npx tsx examples/stamp-vs-marks-v2.ts
 * Output: references/experiment-stamp-vs-marks-v2/*.png
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
  strokeProfileToStamp,
  DEPTH_STANDARD,
  DEPTH_DRAMATIC,
  DEPTH_SUBTLE,
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
const OUT_DIR = join(import.meta.dirname!, "..", "references", "experiment-stamp-vs-marks-v2");
const BG = "#f5f0e8";
const FG = "#1a1a1a";
const SEED = 42;

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

function newCanvas(w = W, h = H): Canvas {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function label(ctx: CanvasRenderingContext2D, text: string, x = 12, y = 18): void {
  ctx.fillStyle = "#666";
  ctx.font = "13px sans-serif";
  ctx.fillText(text, x, y);
}

function save(canvas: Canvas, name: string): void {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `${name}.png`);
  writeFileSync(path, canvas.toBuffer("image/png"));
  console.log(`  ${name}`);
}

// ── Geometry ─────────────────────────────────────────────

/** S-curve with width/pressure variation — same as v1 / bar 12 geometry. */
function sCurveProfile(nPoints = 48, xOffset = 0, yOffset = 0, xScale = 1): StrokeProfile {
  const points: StrokePoint[] = [];
  for (let i = 0; i <= nPoints; i++) {
    const t = i / nPoints;
    const x = xOffset + PAD * xScale + t * (W * xScale - 2 * PAD * xScale);
    const y = yOffset + H / 2 + 40 * Math.sin(t * Math.PI * 2);
    const width = 8 + 16 * Math.sin(t * Math.PI);
    const pressure = 0.3 + 0.7 * Math.sin(t * Math.PI);
    points.push({ x, y, width, pressure });
  }
  return { points, cap: "round" };
}

// ── Mark rendering ────────────────────────────────────────

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

// ── Stamp rendering via adapter ───────────────────────────

function stampViaAdapter(
  ctx: CanvasRenderingContext2D,
  profile: StrokeProfile,
  brushId: string,
  opts: { sceneDepth?: number; depthConfig?: typeof DEPTH_STANDARD } = {},
): void {
  const stroke = strokeProfileToStamp(profile, {
    brushId,
    color: FG,
    seed: SEED,
    ...opts,
  }) as BrushStroke;
  renderStrokes([stroke], BRUSH_PRESETS, ctx, { x: 0, y: 0, width: W, height: H }, SEED);
}

// ── Main ─────────────────────────────────────────────────

console.log("Stamp vs Marks — v2 (via strokeProfileToStamp adapter)\n");

const profile = sCurveProfile();
const outline = generateStrokeOutline(profile);
if (!outline) { console.error("outline failed"); process.exit(1); }
const markCfg: MarkConfig = { density: 0.7, weight: 6, jitter: 0.5 };

// ── 01–06: Same comparisons as v1, now using adapter ─────

// 01 — Ink MarkStrategy (unchanged from v1)
{
  const c = newCanvas();
  const ctx = c.getContext("2d");
  label(ctx, "inkMark (MarkStrategy — polylines)");
  renderMarks(ctx, inkMark.generateMarks(outline, profile, markCfg, mulberry32(SEED)));
  save(c, "01-ink-markstrategy");
}

// 02 — Ink stamp via adapter
{
  const c = newCanvas();
  const ctx = c.getContext("2d");
  label(ctx, "ink-pen (stamp via adapter)");
  stampViaAdapter(ctx, profile, "ink-pen");
  save(c, "02-ink-stamp-adapter");
}

// 03 — Pencil MarkStrategy
{
  const c = newCanvas();
  const ctx = c.getContext("2d");
  label(ctx, "pencilMark (MarkStrategy — polylines)");
  renderMarks(ctx, pencilMark.generateMarks(outline, profile, markCfg, mulberry32(SEED)));
  save(c, "03-pencil-markstrategy");
}

// 04 — Pencil stamp via adapter
{
  const c = newCanvas();
  const ctx = c.getContext("2d");
  label(ctx, "pencil (stamp via adapter)");
  stampViaAdapter(ctx, profile, "pencil");
  save(c, "04-pencil-stamp-adapter");
}

// 05 — Brush MarkStrategy
{
  const c = newCanvas();
  const ctx = c.getContext("2d");
  label(ctx, "brushMark (MarkStrategy — polylines)");
  renderMarks(ctx, brushMark.generateMarks(outline, profile, markCfg, mulberry32(SEED)));
  save(c, "05-brush-markstrategy");
}

// 06 — Bristle stamp via adapter
{
  const c = newCanvas();
  const ctx = c.getContext("2d");
  label(ctx, "texture-bristle (stamp via adapter)");
  stampViaAdapter(ctx, profile, "texture-bristle");
  save(c, "06-bristle-stamp-adapter");
}

// ── 07: Adapter (width→pressure) — direct equivalent of v1 image 07 ─────────
{
  const c = newCanvas();
  const ctx = c.getContext("2d");
  label(ctx, "ink-pen via adapter (width→pressure, same as v1 image 07)");
  stampViaAdapter(ctx, profile, "ink-pen");
  save(c, "07-ink-adapter-width-profile");
}

// ── 08: All presets grid via adapter ─────────────────────────────────────────
{
  const presetIds = ["round-hard", "round-soft", "pencil", "ink-pen", "charcoal-stick", "texture-bristle"];
  const cols = 3;
  const rows = 2;
  const cellW = W / cols;
  const cellH = H;
  const c = newCanvas(cols * cellW, rows * cellH);
  const ctx = c.getContext("2d");

  for (let i = 0; i < presetIds.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = col * cellW;
    const oy = row * cellH;

    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, cellW, cellH);

    ctx.fillStyle = "#666";
    ctx.font = "11px sans-serif";
    ctx.fillText(presetIds[i]!, ox + 8, oy + 16);

    // Build profile in cell-local coordinates
    const pts: StrokePoint[] = [];
    for (let j = 0; j <= 48; j++) {
      const t = j / 48;
      pts.push({
        x: ox + 10 + t * (cellW - 20),
        y: oy + cellH / 2 + 30 * Math.sin(t * Math.PI * 2),
        width: 4 + 8 * Math.sin(t * Math.PI),
      });
    }
    const cellProfile: StrokeProfile = { points: pts, cap: "round" };
    const stroke = strokeProfileToStamp(cellProfile, {
      brushId: presetIds[i]!,
      color: FG,
      seed: SEED,
    }) as BrushStroke;
    renderStrokes([stroke], BRUSH_PRESETS, ctx, { x: 0, y: 0, width: cols * cellW, height: rows * cellH }, SEED);
  }

  save(c, "08-all-presets-grid-adapter");
}

// ── 09: Depth modulation — ink-pen at 5 scene depths ────────────────────────
// Five rows, one per depth, showing how the adapter's sceneDepth + depthConfig
// modulates stamp size and opacity automatically.
{
  const depths = [0, 0.25, 0.5, 0.75, 1.0];
  const rowH = 80;
  const c = newCanvas(W, depths.length * rowH);
  const ctx = c.getContext("2d");

  for (let i = 0; i < depths.length; i++) {
    const d = depths[i]!;
    const oy = i * rowH;

    // Background row stripe
    ctx.fillStyle = BG;
    ctx.fillRect(0, oy, W, rowH);

    // Row label
    ctx.fillStyle = "#888";
    ctx.font = "11px sans-serif";
    ctx.fillText(`depth ${d.toFixed(2)}`, 8, oy + 16);

    // Profile scaled into row height
    const pts: StrokePoint[] = [];
    for (let j = 0; j <= 48; j++) {
      const t = j / 48;
      pts.push({
        x: PAD + t * (W - 2 * PAD),
        y: oy + rowH / 2 + 18 * Math.sin(t * Math.PI * 2),
        width: 6 + 12 * Math.sin(t * Math.PI),
      });
    }
    const rowProfile: StrokeProfile = { points: pts, cap: "round" };
    const stroke = strokeProfileToStamp(rowProfile, {
      brushId: "ink-pen",
      color: FG,
      seed: SEED,
      depthConfig: DEPTH_STANDARD,
      sceneDepth: d,
    }) as BrushStroke;
    renderStrokes([stroke], BRUSH_PRESETS, ctx, { x: 0, y: 0, width: W, height: depths.length * rowH }, SEED);
  }

  save(c, "09-depth-modulation-ink-pen");
}

// ── 10: All presets × 3 depths ────────────────────────────────────────────────
// Grid: columns = presets, rows = fg / mid / bg
// Shows how each preset responds to depth modulation via the adapter.
{
  const presetIds = ["ink-pen", "pencil", "texture-bristle", "charcoal-stick"];
  const sceneDepths = [0, 0.5, 1.0];
  const depthLabels = ["fg", "mid", "bg"];
  const cellW = W / presetIds.length;
  const cellH = 110;
  const c = newCanvas(W, sceneDepths.length * cellH);
  const ctx = c.getContext("2d");

  for (let row = 0; row < sceneDepths.length; row++) {
    const d = sceneDepths[row]!;
    const oy = row * cellH;

    for (let col = 0; col < presetIds.length; col++) {
      const ox = col * cellW;

      ctx.strokeStyle = "#ddd";
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, oy, cellW, cellH);

      ctx.fillStyle = "#888";
      ctx.font = "10px sans-serif";
      ctx.fillText(`${presetIds[col]!} / ${depthLabels[row]!}`, ox + 6, oy + 14);

      const pts: StrokePoint[] = [];
      for (let j = 0; j <= 32; j++) {
        const t = j / 32;
        pts.push({
          x: ox + 8 + t * (cellW - 16),
          y: oy + cellH / 2 + 20 * Math.sin(t * Math.PI * 2),
          width: 4 + 10 * Math.sin(t * Math.PI),
        });
      }
      const p: StrokeProfile = { points: pts, cap: "round" };
      const stroke = strokeProfileToStamp(p, {
        brushId: presetIds[col]!,
        color: FG,
        seed: SEED,
        depthConfig: DEPTH_STANDARD,
        sceneDepth: d,
      }) as BrushStroke;
      renderStrokes([stroke], BRUSH_PRESETS, ctx, { x: 0, y: 0, width: W, height: sceneDepths.length * cellH }, SEED);
    }
  }

  save(c, "10-presets-x-depth-grid");
}

// ── 11: Adapter vs v1 inline — confirm equivalence ───────────────────────────
// Top row: v1's manual width→pressure mapping (reproduced inline).
// Bottom row: adapter. Should look identical.
{
  const c = newCanvas(W, H * 2);
  const ctx = c.getContext("2d");

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H * 2);

  // v1 inline approach (reproduced exactly as in stamp-vs-marks.ts image 07)
  label(ctx, "v1 inline width→pressure mapping", 12, 18);
  {
    const maxW = Math.max(...profile.points.map((p) => p.width));
    const minW = Math.min(...profile.points.map((p) => p.width));
    const pts: PaintStrokePoint[] = profile.points.map((p) => ({
      x: p.x,
      y: p.y,
      pressure: maxW > minW ? (p.width - minW) / (maxW - minW) : 1,
    }));
    const stroke: BrushStroke = { brushId: "ink-pen", color: FG, size: maxW * 2, points: pts, seed: SEED };
    renderStrokes([stroke], BRUSH_PRESETS, ctx, { x: 0, y: 0, width: W, height: H * 2 }, SEED);
  }

  // Adapter approach (offset into row 2)
  label(ctx, "adapter strokeProfileToStamp()", 12, H + 18);
  {
    const offsetProfile: StrokeProfile = {
      points: profile.points.map((p) => ({ ...p, y: p.y + H })),
      cap: "round",
    };
    const stroke = strokeProfileToStamp(offsetProfile, {
      brushId: "ink-pen",
      color: FG,
      seed: SEED,
    }) as BrushStroke;
    renderStrokes([stroke], BRUSH_PRESETS, ctx, { x: 0, y: 0, width: W, height: H * 2 }, SEED);
  }

  // Divider
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(W, H);
  ctx.stroke();

  save(c, "11-adapter-vs-inline-equivalence");
}

console.log("\nDone. Output →", OUT_DIR);
