---
"@openstyle/ai": minor
"@openstyle/schema": minor
"@openstyle/compiler": minor
"@openstyle/manual": minor
---

Prompt hard rule + preflight guard against unreachable duplicate-filter rules.

- **ai (prompt)**: `buildSystemPrompt()` now includes a "no scale, no duplicate filter" rule. When a category needs to render differently at different zoom tiers, the model must emit one class per (category × tier) AND set `scale` on every one so tiers do not overlap. Discourages the failure mode where the model splits "same feature, different look at different zoom" into multiple filter-identical rules without emitting scale ranges — GeoServer picks only the first match and the rest are unreachable.
- **ai (preflight)**: `validateSldPreflight()` gains `detectUnreachableDuplicateRules()`. Emits a `sld-duplicate-filter-no-scale` block-severity issue when two or more `<Rule>`s share an identical `<Filter>` but at least one lacks `<MinScaleDenominator>`/`<MaxScaleDenominator>`. `<ElseFilter>` is exempt (it never fires when other rules match).
- No schema or compiler behavior changes — those two are re-bumped for lockstep.
