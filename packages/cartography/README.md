# @openstyle/cartography

Engine-neutral contracts and pure functions for editing and reviewing canonical OpenStyle maps. Extracted from GeoStyle's working creation flow so other applications can use the same implementation.

## Edit a map

```ts
import { applyOpenStylePatch } from "@openstyle/cartography";
import type { OpenStyle } from "@openstyle/schema";

const original: OpenStyle = {
  schemaVersion: "0.6.0",
  id: "roads-v1",
  name: "City roads",
  layers: [{
    id: "roads",
    selector: { geometry: "line", sourceLayers: ["roads"] },
    zIndex: 10,
    style: {
      name: "roads", geom: "line",
      symbolizer: { kind: "line", stroke: "#ffffff", strokeWidth: 2 },
    },
  }],
};

const { style, changeSummary } = applyOpenStylePatch({
  style: original,
  profile: {
    sourceId: "city-roads",
    layers: [{ id: "roads", geometry: "line", fields: ["name", "class"] }],
  },
  patch: {
    baseStyleId: "roads-v1", sourceId: "city-roads",
    operations: [{
      op: "replace", layerId: "roads", sourceLayer: "roads",
      path: "/casing", value: { color: "#232323", width: 1 },
    }],
  },
  resultId: "roads-v2",
});
// original is unchanged. style contains a canonical roads_underlay line layer.
// changeSummary identifies exactly which layer and fields changed.
```

The input must satisfy `OpenStyleSchema`. Patches contain 1–16 operations and target an exact style version and source profile. Field and geometry checks use the supplied profile; the caller is responsible for deriving it from trusted source data. Modification is atomic: failed validation returns no partial result. Caller metadata and unchanged external graphics are preserved.

This is a restricted editing language, not an arbitrary JSON Patch executor:

- Replace or remove supported symbolizer, classification, label and scale fields.
- Replace `/background` with a hex color.
- Replace/remove `/casing`, or replace its `/color` or `/width` after creating it.
- Use a uniquely bound real source layer. Unknown fields, stale versions, no-op patches, ambiguous targets and new external images are rejected.
- The caller supplies a new `resultId`, persists the previous version for undo, and validates target renderer capabilities before applying the result.

`applyLineCasing(styleModel, { color, width })` also works independently. Width is the extra stroke on **each side**, in pixels, greater than 0 and at most 6. Classification, scale, opacity and hidden-line behavior are retained; labels are removed from the underlay to prevent duplication. A similarly named independent layer is never assumed to be a casing layer without checking its contents.

## Review rendered evidence

| Function | Responsibility |
| --- | --- |
| `summarizeOpenStyle(style)` | Describe editable cores and verified casing pairs; replace embedded image bytes with a preserved-asset marker |
| `buildMapReviewContext(input)` | Select map design, dataset descriptors and change information for a reviewer without project history or feature payloads |
| `measureRenderPixels(input)` | Measure coverage, luminance contrast, chroma and edge density from an RGBA buffer |
| `visualWarningsForMetrics(metrics)` | Flag low coverage, low contrast and excessive edge density |
| `structuralRenderReview(evidence, change, options?)` | Report render/measurement evidence without claiming a model has visually approved the map |
| `needsVisionReview(change?)` | Decide whether the change requires a visual review |
| `mayRepair(report, attempts, limit?)` | Bound repair attempts, excluding missing-data and unsupported-capability failures |

```ts
import { measureRenderPixels, structuralRenderReview } from "@openstyle/cartography";

const metrics = measureRenderPixels({
  data: rgba, width: 640, height: 480, background: "#101018",
});
const report = structuralRenderReview({
  bundleId: style.id, renderedFeatures: 1200, pixelMetrics: metrics,
}, changeSummary, { reviewedAt: new Date().toISOString() });
```

RGBA input comes from the caller's actual render. Hex and RGB colors work without a browser; other CSS formats require a `parseColor` resolver. These diagnostics are heuristics, not a measure of artistic quality. `structuralRenderReview` assumes schema validation already succeeded; its schema field does not validate a document. `pending` and `not-reviewed` remain distinct from visual approval. `RenderQualityReport` is the runtime evidence format, separate from the durable `ReviewReport` contract below.

The module does not capture screenshots, invoke a vision model, schedule a repair, read a clock, access environment variables, or persist projects. Applications own those effects. Use `@openstyle/ai` for pure request and output-budget policies, and renderer adapters for compilation.

## Durable contracts

- `LayerProfile` records bounded, provenance-aware source knowledge.
- `CartographyIntent` records why a map should be designed a certain way.
- `StyleProfile` records transferable visual decisions extracted from a reference without binding them to one dataset or renderer.
- `RenderArtifact` makes a render reproducible and reviewable.
- `ReviewReport` binds findings to exact style and render evidence.
- `RepairPatch` targets an exact style version with reversible operations.
- `OpenStyleDiff` records the resulting version-to-version change.

This package contains no renderer, network, Agent runtime, or publishing code. Existing contract APIs remain available.

## Run the offline example

From the repository root, build the packages, then follow [the workflow example](../../examples/cartography-workflow/README.md). The regression fixtures in `test/fixtures/` preserve canonical before/after styles from the Linyi water-color and New York road-casing edits; they exclude source features, credentials and conversations.
