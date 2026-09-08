# @openstyle/cartography

Reusable editing and review functions for an engine-neutral OpenStyle map, with no browser, server or model transport dependency.

## Controlled edits

`applyOpenStylePatch({ style, profile, patch, resultId })` returns a new canonical style and a change summary. The patch targets `baseStyleId` and `sourceId`; each layer edit binds to a real source layer described by the caller's profile. The function validates all edits before returning and leaves the input intact.

Supported edits include symbolizers, classification, labels, scale ranges, a hexadecimal background and road casing. Unknown style fields, ambiguous layer bindings, stale versions, new external images and no-op edits are rejected. The caller compiles for its target renderer and stores the old version for undo.

`applyLineCasing(styleModel, { color, width })` generates a lower line style. Width is extra pixels per side, greater than zero and no more than six. Classification, scale and opacity are preserved; duplicate labels are removed. The map patch function manages the paired canonical layer.

## Render evidence and review

| API | Input / output |
| --- | --- |
| `summarizeOpenStyle` | Canonical style → editable cores and verified casing pairs |
| `buildMapReviewContext` | Design, source descriptors, changes and metrics → compact reviewer context |
| `measureRenderPixels` | RGBA pixels → coverage, contrast, chroma and edge density |
| `visualWarningsForMetrics` | Pixel measurements → heuristic warnings |
| `structuralRenderReview` | Validated style's render evidence → `RenderQualityReport` |
| `needsVisionReview` | Change size → whether visual review is required |
| `mayRepair` | Review and attempts → bounded repair eligibility |

Pixel heuristics do not prove aesthetic quality. A structural review does not claim that a vision model approved a map. The caller supplies timestamps and screenshots, invokes the model, and applies any approved repair. Credentials, feature payloads and conversation history are not needed by these functions.

## Workflow contracts

The package also exports Zod schemas and TypeScript types for `LayerProfile`, `CartographyIntent`, `StyleProfile`, `RenderArtifact`, `ReviewReport`, `RepairPatch` and `OpenStyleDiff`.

`RenderQualityReport` describes runtime review state and is not interchangeable with the durable `ReviewReport` contract. In particular, a pending or unreviewed runtime result must not be converted to a passed review.

See the [package README](https://github.com/gaopengbin/openstyle/tree/main/packages/cartography) for code examples and exact contracts, and the [offline workflow example](https://github.com/gaopengbin/openstyle/tree/main/examples/cartography-workflow) for a model-free verification run. These new helpers are present in the local source; a package release is a separate step.
