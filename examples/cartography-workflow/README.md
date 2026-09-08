# Offline cartography workflow

An executable example of the built OpenStyle public APIs. It replays two real accepted GeoStyle edits, derives road casings, compiles both renderers, measures a calibration pixel buffer, checks quality decisions and prepares an AI request policy. It does not contact a model, load a map service or require credentials.

## Run

From the OpenStyle repository root, with workspace dependencies already installed and packages built:

```bash
node examples/cartography-workflow/run.mjs
```

To save the resulting OpenStyle documents, MapLibre compile results and verification report inside this example:

```bash
node examples/cartography-workflow/run.mjs --write
```

The script resolves paths relative to itself, so it also works from another current directory. Unknown arguments fail rather than choosing an arbitrary output path. `output/` is generated and ignored by Git.

If the package builds are missing or outdated, build the required workspace packages first (these are local compilation commands, not package installation):

```bash
pnpm --filter @openstyle/schema build
pnpm --filter @openstyle/adapter build
pnpm --filter @openstyle/cartography build
pnpm --filter @openstyle/ai build
pnpm --filter @openstyle/openlayers build
pnpm --filter @openstyle/maplibre build
```

No dependencies, package configuration or lockfile are added by this example. Imports use `packages/*/dist/index.js`, the same built entry points listed in the packages' public `exports.import` fields. In an installed application use the corresponding `@openstyle/cartography`, `@openstyle/ai`, `@openstyle/openlayers` and `@openstyle/maplibre` package imports.

## What is checked

| Public API | Executed check |
| --- | --- |
| `applyOpenStylePatch` | Reproduce the accepted Linyi water edit and New York road casing edit exactly; preserve original input and reject stale style IDs or other source IDs. |
| `summarizeOpenStyle`, `applyLineCasing` | Recover the existing casing, regenerate its lower stroke without changing the core or duplicating labels. |
| `compileOpenStyleToOpenLayers` | Compile each complete style and evaluate a clearly synthetic road selector probe; confirm the wider underlay remains below the core. |
| `compileOpenStyleToMapLibre` | Compile each complete style; confirm lower-stroke order and width. Compiler warnings are reported unchanged. |
| `measureRenderPixels`, `visualWarningsForMetrics` | Measure an 8 × 8 RGB calibration pattern, use an injected color parser, and verify exact coverage, contrast, chroma and edge values. |
| `structuralRenderReview`, `needsVisionReview`, `mayRepair` | Evaluate change extent and explicitly reject absent render/data evidence; do not treat successful compilation as a visually accepted map. |
| `buildMapReviewContext`, `rewriteChatRequestBody` | Prepare bounded design context and apply model/output/thinking policy while preserving messages and tools. Nothing is sent. |

The inputs come from [`linyi-water.json`](../../packages/cartography/test/fixtures/linyi-water.json) and [`new-york-casing.json`](../../packages/cartography/test/fixtures/new-york-casing.json). Each keeps its provenance and attribution (`© OpenStreetMap contributors`, ODbL-1.0). They contain real before/after styles and reconstructed accepted patches, but no feature geometry, account data, conversation or credentials.

Accepted patch outputs are compared exactly. Deriving a casing from existing widths can introduce floating-point subtraction/addition noise; only those derived stroke widths use a 1e-6 comparison tolerance, matching the summary's casing detection precision. Other style fields are still compared exactly.

## What this does not prove

This is a public API integration example, not a browser rendering or visual acceptance test. The OpenLayers feature probe and the RGBA calibration pattern are synthetic and explicitly separated from the real style fixtures. Because those fixtures do not contain map geometry or pixels, the quality example intentionally supplies zero rendered features and gets a failed render with no automatic repair. It never claims a vision-model pass.

MapLibre outputs contain an empty GeoJSON source and a local glyph template. A host must provide its actual data, glyphs, registered image descriptors and a renderer before displaying a map. The OpenLayers compiler returns a style function rather than a PNG. The prepared AI body is a serialization-policy example; a host remains responsible for provider setup, authorization, sending requests and reviewing results.

A successful run exits with code 0 and reports `success: true`, zero network/model requests, `browserRendering: false` and `visualAcceptance: false`. Any assertion or compilation error exits unsuccessfully; it is not hidden behind a fallback.
