---
"@openstyle/schema": minor
"@openstyle/compiler": minor
"@openstyle/ai": minor
"@openstyle/manual": minor
---

Add scale-denominator support (fine-grained, additive).

- **schema**: new `ScaleRangeSchema` = `{ minScaleDenominator?, maxScaleDenominator? }` with `min ≤ max` refine. Mounted at three positions: `StyleRuleClass.scale`, `classification.fallbackScale`, and top-level `StyleModel.scale` (for single-symbolizer models). All optional — existing StyleModels remain valid.
- **compiler**: emit `<MinScaleDenominator>` / `<MaxScaleDenominator>` in the correct OGC SLD 1.0 position (after Filter/ElseFilter, before symbolizers).
- **ai**: `buildSystemPrompt()` teaches the LLM when to add `scale` and where. Prompt gates usage on the user explicitly asking for zoom-dependent styling.
- **manual**: `DEFAULT_SCALE_LADDER` filled with 7 named web-map tiers (world / country / region / city / district / street / building), roughly aligned with OSM z0-z18.
- `validateStyleModel()` warns when top-level `scale` is set alongside `classification` (it would be silently ignored).
