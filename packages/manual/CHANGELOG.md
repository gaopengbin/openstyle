# @openstyle/manual

## 0.7.0

### Minor Changes

- 2b721b8: Prompt hard rule: labels asked by the user MUST be emitted.

  The model was observed to hallucinate schema limitations (e.g. "StyleModel does not support multiple symbolizers per class, so I skip the label") and quietly drop labels the user explicitly asked for. The prompt now:

  - Enumerates every synonym for "label" the user might use — English and Chinese — and says any of them makes `label` REQUIRED.
  - Instructs the model to pick a name-like field for `label.field` and stop making up reasons to skip.
  - Explicitly names the "invent a limitation" failure mode as a thing NOT to do.

  Only `@openstyle/ai` has a substantive change; the other packages are bumped for lockstep.

- 2b721b8: Along-line label placement.

  - **schema**: `StyleLabel.placement?` — a discriminated union of `PointLabelPlacement` (anchor / offset / rotation) and `LineLabelPlacement` (perpendicularOffset + GeoServer VendorOptions: `followLine`, `repeat`, `maxDisplacement`, `maxAngleDelta`, `group`, `autoWrap`, `spaceAround`). All optional — omitting `placement` keeps GeoServer's default behaviour. Top-level refine rejects `kind: "line"` on non-line geometries.
  - **compiler**: `labelXml` emits `<LabelPlacement>` (Point or Line) and, when placement is line, appends the corresponding `<VendorOption>` elements to the TextSymbolizer. Halo/Fill order corrected to SLD 1.0 § 11.6.
  - **ai (prompt)**: `buildSystemPrompt()` learns that **labels on line features MUST follow the line** — for any `geom: "line"` style with a label, set `label.placement` to `{ kind: "line", followLine: true, repeat: 150, ... }`. Without this, GeoServer plants one label at the centroid of each line — a floating name in the middle of a long road.
  - **ai (preflight)**: `validateSldPreflight()` gains `detectLineLabelWithoutLinePlacement()`. When an SLD has `<LineSymbolizer>` AND `<TextSymbolizer>` but no `<LinePlacement>`, emit a `sld-line-label-not-along-line` block-severity issue.
  - No manual content changes — bumped for lockstep.

- 2b721b8: Prompt hard rule + preflight guard against unreachable duplicate-filter rules.

  - **ai (prompt)**: `buildSystemPrompt()` now includes a "no scale, no duplicate filter" rule. When a category needs to render differently at different zoom tiers, the model must emit one class per (category × tier) AND set `scale` on every one so tiers do not overlap. Discourages the failure mode where the model splits "same feature, different look at different zoom" into multiple filter-identical rules without emitting scale ranges — GeoServer picks only the first match and the rest are unreachable.
  - **ai (preflight)**: `validateSldPreflight()` gains `detectUnreachableDuplicateRules()`. Emits a `sld-duplicate-filter-no-scale` block-severity issue when two or more `<Rule>`s share an identical `<Filter>` but at least one lacks `<MinScaleDenominator>`/`<MaxScaleDenominator>`. `<ElseFilter>` is exempt (it never fires when other rules match).
  - No schema or compiler behavior changes — those two are re-bumped for lockstep.

- 2b721b8: Add scale-denominator support (fine-grained, additive).

  - **schema**: new `ScaleRangeSchema` = `{ minScaleDenominator?, maxScaleDenominator? }` with `min ≤ max` refine. Mounted at three positions: `StyleRuleClass.scale`, `classification.fallbackScale`, and top-level `StyleModel.scale` (for single-symbolizer models). All optional — existing StyleModels remain valid.
  - **compiler**: emit `<MinScaleDenominator>` / `<MaxScaleDenominator>` in the correct OGC SLD 1.0 position (after Filter/ElseFilter, before symbolizers).
  - **ai**: `buildSystemPrompt()` teaches the LLM when to add `scale` and where. Prompt gates usage on the user explicitly asking for zoom-dependent styling.
  - **manual**: `DEFAULT_SCALE_LADDER` filled with 7 named web-map tiers (world / country / region / city / district / street / building), roughly aligned with OSM z0-z18.
  - `validateStyleModel()` warns when top-level `scale` is set alongside `classification` (it would be silently ignored).

### Patch Changes

- Updated dependencies [2b721b8]
- Updated dependencies [2b721b8]
- Updated dependencies [2b721b8]
- Updated dependencies [2b721b8]
- Updated dependencies
  - @openstyle/schema@0.7.0
