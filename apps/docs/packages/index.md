# Packages

openstyle is a monorepo of eight composable packages. For 0.7.0, use the [GitHub bundle installation guide](../guide/getting-started): npm publication is not complete, and individual tarballs still need their internal OpenStyle dependencies resolved. The bundle includes those dependencies and the required pnpm overrides.

| Package | Purpose |
| --- | --- |
| [`@openstyle/schema`](./schema) | zod schema + TypeScript types for `StyleModel` |
| [`@openstyle/compiler`](./compiler) | Deterministic `StyleModel` → OGC SLD 1.0 XML emitter |
| [`@openstyle/cartography`](./cartography) | Source-bound style edits, line casing, pixel diagnostics and review contracts |
| `@openstyle/adapter` | Renderer capability declarations and negotiation |
| `@openstyle/openlayers` | StyleModel and whole-map OpenLayers compilation |
| `@openstyle/maplibre` | Whole-map MapLibre style compilation |
| [`@openstyle/ai`](./ai) | Prompt builder, validators, request policies and output-budget decisions |
| [`@openstyle/manual`](./manual) | Cookbook-distilled reference material — palettes, scale ladders, few-shot |

Dependency graph:

```
schema ← compiler / ai / manual / cartography / adapter
schema + adapter ← openlayers / maplibre
```

`schema` has no runtime dependency other than `zod`. The core packages above depend on it. `cartography` also uses schema validation but does not depend on a renderer; `adapter` supplies capability negotiation to `openlayers` and `maplibre`. `ai` leaves model transport and credentials to the caller.
