# openstyle

> An open, AI-friendly toolkit for map styling — a shared map grammar, renderer adapters, controlled edits and evidence-based review utilities.

[中文文档](./README.zh-CN.md)

## Why

Map styling should be **grammar-checked before it leaves the model**. openstyle gives AI agents a bounded shape to fill in, a deterministic compiler that turns that shape into standards-compliant SLD, and a curated prompt manual so the model doesn't have to invent OGC XML from memory.

The toolkit separates map representation, compilation and creation policies:

1. **Schema** (`@openstyle/schema`) — the JSON shape (with zod runtime validation) that an LLM must produce. Small, opinionated, complete for real cartography needs (scale layering, classification, labels, symbolizers).
2. **Compiler** (`@openstyle/compiler`) — turns a validated `StyleModel` into strict [OGC SLD 1.0](https://docs.ogc.org/is/02-070/02-070.pdf) XML. No LLM ever touches `<sld:...>`.
3. **Manual + AI helpers** (`@openstyle/manual`, `@openstyle/ai`) — a distilled version of the [GeoServer SLD Cookbook](https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/), plus system-prompt builders and field-reference validators, so any AI agent can pick up the format quickly.
4. **Cartography** (`@openstyle/cartography`) — canonical map patches, classification-aware road casing, compact review context, pixel diagnostics and bounded repair decisions. Applications bring their own renderer capture, model transport and persistence.

## Status

**Early alpha.** APIs will shift as the schema stabilizes.

Extracted from [GeoServer-AI-Style-Studio](https://github.com/gaopengbin/GeoServer-AI-Style-Studio) so the styling grammar can evolve independently of any single application.

## Packages

| Package | Description |
| --- | --- |
| [`@openstyle/schema`](./packages/schema) | `StyleModel` TypeScript type + zod schema + validators |
| [`@openstyle/compiler`](./packages/compiler) | `compileToSld` / `formatSld` — deterministic SLD 1.0 emitter |
| [`@openstyle/cartography`](./packages/cartography) | Atomic map edits, casing, render diagnostics and review contracts |
| [`@openstyle/adapter`](./packages/adapter) | Renderer capability declarations and negotiation |
| [`@openstyle/openlayers`](./packages/openlayers) | `compileToOpenLayers` — deterministic OpenLayers `StyleFunction` adapter |
| [`@openstyle/maplibre`](./packages/maplibre) | `compileOpenStyleToMapLibre` — deterministic MapLibre Style Specification adapter with explicit capability negotiation |
| [`@openstyle/manual`](./packages/manual) | Cookbook-distilled prompt manual (scale ladders, palettes, few-shot) |
| [`@openstyle/ai`](./packages/ai) | Prompts, validators, request policies and output-budget decisions |

The reusable GeoStyle creation functions are implemented in this repository and consumed by GeoStyle. Version 0.7.0 is distributed as a GitHub prerelease; npm publication is separate and has not been completed. See the [extraction record](./docs/geostyle-extraction-2026-09-08.md), [offline workflow example](./examples/cartography-workflow/README.md), and [release instructions](./docs/releasing.md).

## Quick start

Download `openstyle-0.7.0-bundle.zip` from the [v0.7.0 release](https://github.com/gaopengbin/openstyle/releases/tag/v0.7.0), extract it, and run `pnpm install` inside its directory. The bundle pins all eight OpenStyle packages to included tarballs; external dependencies still need registry access or a populated pnpm cache. Then import the packages normally:

```ts
import { StyleModelSchema } from "@openstyle/schema";
import { compileToSld } from "@openstyle/compiler";

const model = StyleModelSchema.parse({
  name: "population_choropleth",
  geom: "polygon",
  classification: {
    field: "POP_DENS",
    classes: [
      { label: "Low",  filter: { op: "lt",  value: 100  }, symbolizer: { kind: "polygon", fill: "#f7fbff" } },
      { label: "High", filter: { op: "gte", value: 1000 }, symbolizer: { kind: "polygon", fill: "#08306b" } },
    ],
  },
});

const sld = compileToSld(model);
// -> "<StyledLayerDescriptor ...>...</StyledLayerDescriptor>"
```

## Repo layout

```
openstyle/
├── packages/
│   ├── schema/     # zod schema + types
│   ├── compiler/   # SLD 1.0 XML emitter
│   ├── cartography/ # controlled edits, evidence and workflow contracts
│   ├── adapter/    # renderer capability negotiation
│   ├── maplibre/   # MapLibre whole-map adapter
│   ├── manual/     # AI prompt manual & few-shot library
│   ├── ai/         # system-prompt builder + validators
│   └── openlayers/ # OpenLayers StyleFunction adapter
├── apps/
│   └── docs/       # VitePress documentation site
├── skills/         # Claude Code skills (sld-generator, sld-review, sld-cookbook)
├── examples/       # end-to-end demos
└── .changeset/     # release notes
```

## Development

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

Requires Node ≥ 18.18 and pnpm ≥ 9.

## References

- [OGC SLD 1.0.0 Implementation Specification (02-070)](https://docs.ogc.org/is/02-070/02-070.pdf)
- [OGC Symbology Encoding 1.1.0 (05-077r4)](https://docs.ogc.org/is/05-077r4/05-077r4.pdf)
- [GeoServer SLD Cookbook](https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/)
- [GeoServer SLD Reference](https://docs.geoserver.org/latest/en/user/styling/sld/reference/)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and PRs welcome once the schema stabilizes.

## License

MIT © 2026 gaopengbin and openstyle contributors
