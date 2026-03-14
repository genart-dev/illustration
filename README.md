# @genart-dev/illustration

Stroke outline generation, branch junctions, and mark-making for [genart.dev](https://genart.dev).

Transforms centerline geometry into production-quality illustrated output — smooth outlines, clean branch junctions, and medium-specific mark strategies (ink, pencil, engraving, woodcut, brush).

## Install

```bash
npm install @genart-dev/illustration
```

## Quick Start

```typescript
import {
  segmentToProfile,
  generateStrokeOutline,
  inkMark,
} from "@genart-dev/illustration";

// 1. Convert geometry to a stroke profile
const profile = segmentToProfile({ x1: 0, y1: 0, x2: 200, y2: 0, width: 10 });

// 2. Generate the outline polygon
const outline = generateStrokeOutline(profile);

// 3. Apply a mark strategy
const marks = inkMark.generateMarks(outline, profile, { density: 1, weight: 1 }, Math.random);
// → Mark[] — polylines with width and opacity, ready for your renderer
```

## API

### Stroke Outlines

Convert a centerline with per-point widths into a closed polygon (left/right edges + caps).

- **`generateStrokeOutline(profile, options?)`** — full outline with left, right, startCap, endCap
- **`generateStrokePolygon(profile, options?)`** — flattened polygon (single Point2D[])
- **`taperScale(t, taper)`** — width multiplier at position t given a TaperSpec
- **`generateCap(center, tangent, halfWidth, style)`** — cap geometry

### Adapters

Convert from common formats to `StrokeProfile`:

- **`segmentToProfile(segment)`** — single TurtleSegment (x1/y1/x2/y2/width)
- **`segmentsToProfiles(segments)`** — batch conversion
- **`algorithmPathToProfile(path)`** — algorithm stroke paths with per-point data

### Branch Junctions

Merge branching outlines into smooth, continuous forms — eliminating the arrowhead artifacts that plague naive stroke rendering.

- **`mergeYJunction(parent, child, attachment)`** — merge two outlines at a fork
- **`mergeSegmentTree(segments, options?)`** — merge an entire segment tree
- **`enforceG1AtJunctions(points, junctions)`** — tangent continuity at joins
- **`smoothAtIndex(points, index, radius?)`** — local smoothing
- **`subdivideSharpCorners(points, maxAngle?)`** — break up acute angles

### Mark Strategies

Each strategy implements `MarkStrategy.generateMarks(outline, profile, config, rng) → Mark[]`:

| Strategy | Character | Reference |
|----------|-----------|-----------|
| `technicalMark` | Uniform weight, no variation — CAD/architectural | Technical pen |
| `inkMark` | Pressure-based width, endpoint pooling | Bamboo & Rock (Deng Yu) |
| `pencilMark` | Multi-pass offset strokes, cross-hatching | Graphite landscape |
| `engravingMark` | Contour outline + clipped parallel hatching | Copper-plate engraving |
| `woodcutMark` | Bold fill + carved gouge marks | Block print |
| `brushMark` | Thick→thin taper, dry-brush filaments, wet pooling | Sumi-e ink painting |

### Fill Strategies

Each implements `FillStrategy.generateMarks(polygon, config, rng) → Mark[]`:

- **`hatchFill`** — parallel lines at configurable angle and density
- **`crosshatchFill`** — two perpendicular hatch layers
- **`stippleFill`** — quasi-random dot distribution

### Utilities

Vector math, arc-length parameterization, Catmull-Rom interpolation, and polygon operations (point-in-polygon, area, bounds, offset, outline flattening).

## Design

- **Zero dependencies** on `@genart-dev/format` — uses structural typing throughout
- **Declarative output** — strategies return `Mark[]` data; rendering to canvas/SVG is the consumer's job
- **Composable** — adapters → outlines → junctions → marks, mix and match at each stage

## Quality Bars

See [QUALITY.md](QUALITY.md) for the 24 visual quality bars that define "done" for each phase.

## License

MIT
