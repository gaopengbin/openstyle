---
"@openstyle/schema": minor
"@openstyle/compiler": minor
"@openstyle/ai": minor
"@openstyle/manual": minor
---

Along-line label placement.

- **schema**: `StyleLabel.placement?` — a discriminated union of `PointLabelPlacement` (anchor / offset / rotation) and `LineLabelPlacement` (perpendicularOffset + GeoServer VendorOptions: `followLine`, `repeat`, `maxDisplacement`, `maxAngleDelta`, `group`, `autoWrap`, `spaceAround`). All optional — omitting `placement` keeps GeoServer's default behaviour. Top-level refine rejects `kind: "line"` on non-line geometries.
- **compiler**: `labelXml` emits `<LabelPlacement>` (Point or Line) and, when placement is line, appends the corresponding `<VendorOption>` elements to the TextSymbolizer. Halo/Fill order corrected to SLD 1.0 § 11.6.
- **ai (prompt)**: `buildSystemPrompt()` learns that **labels on line features MUST follow the line** — for any `geom: "line"` style with a label, set `label.placement` to `{ kind: "line", followLine: true, repeat: 150, ... }`. Without this, GeoServer plants one label at the centroid of each line — a floating name in the middle of a long road.
- **ai (preflight)**: `validateSldPreflight()` gains `detectLineLabelWithoutLinePlacement()`. When an SLD has `<LineSymbolizer>` AND `<TextSymbolizer>` but no `<LinePlacement>`, emit a `sld-line-label-not-along-line` block-severity issue.
- No manual content changes — bumped for lockstep.
