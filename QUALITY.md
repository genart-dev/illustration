# @genart-dev/illustration — Quality Bars

Quality bars for the illustration package. Each bar defines a visual
test that the package must pass before that capability is considered
done. Bars are grouped by module and phased to match the roadmap.

## How to read these bars

Each bar has:
- **Name** — short identifier
- **What to render** — the specific test geometry
- **Pass criteria** — what "good" looks like, with reference
- **Fail signature** — the specific artifact that means it's broken
- **Reference** — artwork or tradition that demonstrates the target

---

## Phase 1: Stroke Outlines (v0.1.0)

### Bar 1 — Straight Stroke, Uniform Width
**Render**: Horizontal line, 200px long, 10px half-width, flat caps.
**Pass**: Clean rectangle. Left and right edges perfectly parallel.
Corners sharp (flat cap) or smoothly rounded (round cap). Area ≈ 4000px².
**Fail**: Edges not parallel. Area off by >5%. Any self-intersection.

### Bar 2 — Tapered Stroke
**Render**: Horizontal line, 200px long, 10px half-width, taper start=40 end=60.
**Pass**: Needle shape — starts at zero width, swells to full, narrows to
zero. Smooth continuous silhouette. No kinks at taper transition points.
**Fail**: Abrupt width change at taper boundary. Flat spot at start/end
instead of point. Width doesn't reach zero at endpoints.

### Bar 3 — Curved Stroke, Constant Width
**Render**: Quarter-circle arc (90° bend), 8 vertices, constant 8px half-width.
**Pass**: Uniform-width ribbon following the curve. Inner edge shorter than
outer edge (correct geometry, not just offset). No pinching at the apex.
Width consistent within ±10% along the entire arc.
**Fail**: Visible faceting (too few points). Pinch or bulge at the bend
apex. Width variation >20%.
**Reference**: Technical pen drawing — consistent line weight through curves.

### Bar 4 — S-Curve with Width Variation
**Render**: S-shaped centerline (sine wave, 2 periods), width varies from
2px at endpoints to 12px at peaks.
**Pass**: Calligraphic ribbon — gracefully swelling and thinning. Outline
is smooth (no polygon faceting visible at normal zoom). No self-intersection
even where thin.
**Fail**: Outline crosses itself at thin points. Visible jagged edges.
Abrupt width transitions.
**Reference**: Brush calligraphy — the "thick-down, thin-up" of a broad-nib pen.

### Bar 5 — Acute Angle (Miter Limiting)
**Render**: V-shape, two segments meeting at 30°, 6px half-width.
**Pass**: Clean join at the vertex. Miter is beveled (no spike extending
far beyond the vertex). Both legs have correct width.
**Fail**: Spike/arrowhead artifact at the acute join. This is THE failure
mode that motivates the entire package — the exact artifact visible in
every current plant render at branch junctions.
**Reference**: The arrowhead artifacts in hero-bonsai-sumi-e.png.
This bar exists to prove we've eliminated them.

### Bar 6 — Three Cap Styles
**Render**: Same 100px stroke rendered three times: round, flat, pointed caps.
**Pass**: Round cap is a smooth semicircle. Flat cap is a clean perpendicular
cut. Pointed cap extends ~0.8× width beyond endpoint. All three outlines
are valid closed polygons.
**Fail**: Round cap has visible vertices (<6 points for a thick stroke).
Pointed cap has zero extension. Any cap produces a self-intersecting polygon.

---

## Phase 2: Branch Junctions (v0.2.0)

### Bar 7 — Y-Junction (60° Fork)
**Render**: Parent branch (12px wide) with child branch (8px wide) forking
at 60° at t=0.6 along the parent.
**Pass**: Smooth crotch curve where branches separate. No overlap region
where both outlines pile up (creating a dark spot). Outer contour is a
single continuous polygon. Child width transitions smoothly from the
attachment width to its own width.
**Fail**: Dark overlap at junction (two filled polygons on top of each
other). Sharp corner at crotch (no curve). Gap between parent and child
outlines.
**Reference**: Old Plum (Kano Sansetsu) — bold ink branches fork with
smooth inner curves. Also: any good botanical illustration of tree branching.

### Bar 8 — Narrow-Angle Fork (20°)
**Render**: Parent with child forking at 20° — nearly parallel.
**Pass**: Crotch curve is very short (branches barely separate). Merged
outline is still valid (no self-intersection). Reads as a single
thickening branch that splits.
**Fail**: Self-intersection in the merged polygon. Crotch curve overshoots
into the branch interior.

### Bar 9 — Wide-Angle Fork (150°)
**Render**: Parent with child forking at 150° — nearly backwards.
**Pass**: Crotch curve wraps around smoothly. No degenerate geometry.
Child appears to emerge from the side of the parent.
**Fail**: Outline collapses or produces garbage geometry. Crotch curve
has infinite curvature.

### Bar 10 — Multi-Level Tree (Depth 0–4)
**Render**: Simple L-system tree: trunk → 2 branches → 4 sub-branches →
8 twigs. ~15 segments total.
**Pass**: All junctions smooth. Width naturally decreasing with depth.
Entire tree is a connected set of merged outlines (not 15 independent
rectangles). Reads as a single organic form.
**Fail**: Any arrowhead artifact at any junction. Disconnected segments
visible. Tree looks like a pile of overlapping rectangles.
**Reference**: Bamboo and Rock (Deng Yu) — continuous ink branch forms.
Also: Landscape (Wang Duo) — tree branches in shan-shui style show
continuous width flow from trunk to twig.

### Bar 11 — Trunk Base Flare
**Render**: Tree from Bar 10 with additional flare at ground level
(1.3–1.5× trunk width, with root tendrils).
**Pass**: Smooth widening at the base. Flare integrates with trunk outline
(same polygon, not a separate shape). Root tendrils taper to points.
**Fail**: Flare is a visibly separate shape overlapping the trunk. Sharp
transition from normal width to flare width.

---

## Phase 3: Mark Strategies (v0.3.0)

### Bar 12 — Ink Line
**Render**: S-curve stroke, rendered with ink mark strategy.
**Pass**: Confident single stroke with subtle width variation from
pressure. Slight darkening at endpoints (ink pooling). Reads as a
single gesture, not a computed curve.
**Fail**: Perfectly uniform — looks mechanical, not hand-drawn.
No width variation at all.
**Reference**: Bamboo and Rock — single confident ink strokes with
natural width variation.

### Bar 13 — Pencil Sketch
**Render**: Same S-curve, rendered with pencil strategy, 3 passes.
**Pass**: Multiple slightly-offset strokes build up value. Individual
strokes visible (not blended into a single band). Lighter pressure at
ends. Reads as graphite on paper.
**Fail**: Single solid line (no multi-pass character). Strokes perfectly
overlapping (no offset/jitter). Opaque black instead of translucent gray.
**Reference**: Snižina — graphite landscape made from accumulated marks.

### Bar 14 — Engraving Hatching
**Render**: Leaf outline (simple ovate), filled with engraving strategy.
Contour outline + parallel hatching inside, density varying with a
shading function (darker at one edge).
**Pass**: Clean thin contour outline. Interior filled with parallel lines
at consistent angle. Line spacing varies smoothly with shading value
(tight = dark, loose = light). Lines clip cleanly at leaf boundary.
Reads as a copper-plate engraving.
**Fail**: Hatching extends beyond leaf boundary. Spacing is uniform
(no tonal variation). Lines have visible start/end stubs at boundary.
**Reference**: Schwere See (Licia He) — this is the ONE existing success
case. Also: any 18th-century botanical engraving plate.

### Bar 15 — Woodcut Bold
**Render**: Trunk segment (thick, depth 0), rendered with woodcut strategy.
**Pass**: Bold solid fill with carved gouge marks (thin white lines cut
through the black). Gouges follow the branch direction. Overall reads as
a block print.
**Fail**: Gouge marks too large (jack-o-lantern effect — the exact current
failure in plugin-plants woodcut style). Gouges randomly oriented instead
of following branch direction. So many gouges the trunk reads as gray
instead of black-with-white-cuts.
**Reference**: Traditional woodcut prints — the white marks are narrow and
deliberate, the black mass dominates.

### Bar 16 — Brush/Sumi-e
**Render**: Branch segment with leaf, rendered with brush strategy.
**Pass**: Wide stroke with visible thick→thin transition. Dry-brush
texture at fast sections (stroke breaks up). Wet pooling at slow sections
(endpoints, direction changes). Leaf is a single gestural stroke.
**Fail**: Uniform width throughout. No dry-brush breakup. No wet pooling.
Looks like a filled polygon, not a brushstroke.
**Reference**: Old Plum (Kano Sansetsu) — bold branch strokes with wet/dry
variation. Also: traditional sumi-e bamboo painting tutorials.

### Bar 17 — Technical Line
**Render**: Multi-segment polyline, rendered with technical strategy.
**Pass**: Perfectly uniform weight, no variation. Clean joins, no jitter.
Reads as CAD/architectural drawing. This is the "precise" baseline that
other strategies depart from.
**Fail**: Any width variation. Any jitter. Any artistic character.

---

## Phase 3: Fill Strategies (v0.3.0)

### Bar 18 — Hatch Fill with Tonal Gradient
**Render**: Square region, hatched at 45°, density modulated by a
linear gradient (sparse at top, dense at bottom).
**Pass**: Parallel lines at 45°. Spacing smoothly decreases from top
to bottom. All lines clip at region boundary. No orphan stubs (<3px
segments). Reads as pencil shading.
**Fail**: Spacing is uniform (no gradient). Lines extend past boundary.
Visible gaps at boundary (lines don't reach edge).
**Reference**: Reference #7 from terrain quality bar — gray rolling hills
with contour lines, value gradients light-to-dark.

### Bar 19 — Crosshatch Tonal Range
**Render**: Circle region, crosshatched at 0° and 45°, density from 0.1
to 0.9 across five strips.
**Pass**: Five distinct tonal values from near-white to near-black.
At low density, individual lines clearly visible. At high density,
the two hatch directions create a woven texture. Tonal steps are
perceptually even.
**Fail**: Low and mid density look the same. High density is solid
black (line spacing < line width). Hatch angles not visually distinct.

### Bar 20 — Stipple Dot Distribution
**Render**: Irregular polygon, stipple-filled at medium density.
**Pass**: Dots distributed with quasi-random spacing (no obvious grid
artifacts, no large empty holes). Dot sizes vary slightly. Reads as
stippled ink illustration.
**Fail**: Visible grid pattern. Large empty patches inside the region.
Dots placed outside the polygon boundary.

### Bar 21 — Contour Fill (Future)
**Render**: Leaf outline, filled with contour-following lines.
**Pass**: Lines follow the shape of the leaf boundary, progressively
shrinking inward. Even spacing. Creates a topographic-map effect.
**Fail**: Lines follow a fixed angle (not contour). Self-intersecting
offset contours at concavities.
**Reference**: Reference #3 from terrain quality bar — mountain with
contour lines following form.

---

## Integration Tests (v0.4.0)

### Bar 22 — Full Tree, Engraving Style
**Render**: L-system tree (50+ segments, 3 depth levels, leaves) →
merged outlines → engraving marks + hatched leaf fills.
**Pass**: Trunk and branches are smooth continuous forms (no arrowheads).
Hatching follows branch direction on trunk, fills leaf interiors.
Line weight decreases with depth. Reads as a botanical engraving plate.
The quality ceiling has risen above what plugin-plants can produce today.
**Fail**: Any arrowhead artifact. Hatching at wrong angle. Leaves
rendered as circles/blobs instead of species-appropriate shapes.
**Reference**: 18th-century botanical engravings. The whole point of the
illustration package is reaching this level.

### Bar 23 — Full Tree, Ink-Brush Style
**Render**: Same tree geometry → merged outlines → brush marks.
**Pass**: Thick confident trunk strokes, thinning to gestural twigs.
Wet-dry variation. Leaves as single-stroke gestures. Atmospheric
depth: foreground branches bold, background branches light.
**Fail**: All branches same weight regardless of depth. No wet/dry
character. Leaves are filled polygons.
**Reference**: Bamboo and Rock (Deng Yu), Old Plum (Kano Sansetsu).

### Bar 24 — Terrain Profile, Hatched
**Render**: Mountain profile polyline → stroke outline with width from
depth → hatching inside the outline following surface normal.
**Pass**: Mountain form with contour hatching that follows the slope.
Denser hatching on shadowed faces, sparser on lit faces. Ridge line
is clean. Reads as a hand-drawn landscape illustration.
**Fail**: Hatching doesn't follow slope (all lines at same angle).
No shading variation (uniform density). Ridge line has polygon facets.
**Reference**: Reference #2 from terrain quality bar — 9-panel mountains
with hatching following surface normals.

---

## Meta Quality: The "Illustration Gap" Test

The ultimate quality bar is comparative. Take any structural output
(tree, terrain, pattern) and render it two ways:

1. **Current method**: plugin draws directly with `lineTo()` / `lineWidth`
2. **Illustration method**: plugin → StrokeProfile → outline → marks

If the illustration method doesn't produce *visibly better* output at
every complexity level, the package has failed its purpose. The whole
point is raising the quality ceiling — not adding abstraction for its
own sake.

The illustration method should win on:
- **Junction quality** — smooth vs. arrowhead
- **Width control** — continuous taper vs. uniform `lineWidth`
- **Mark character** — medium-specific marks vs. generic strokes
- **Tonal range** — hatching/stipple density vs. flat fills
- **Style portability** — same geometry, many styles, all convincing
