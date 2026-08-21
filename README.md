# openstyle

> An open, AI-friendly toolkit for map styling — schema, compiler, and prompt manual for SLD (and, eventually, more).

[中文文档](./README.zh-CN.md)

## Why

Map styling should be **grammar-checked before it leaves the model**. openstyle gives AI agents a bounded shape to fill in, a deterministic compiler that turns that shape into standards-compliant SLD, and a curated prompt manual so the model doesn't have to invent OGC XML from memory.

Three layers, one repo:

1. **Schema** (`@openstyle/schema`) — the JSON shape (with zod runtime validation) that an LLM must produce. Small, opinionated, complete for real cartography needs (scale layering, classification, labels, symbolizers).
2. **Compiler** (`@openstyle/compiler`) — turns a validated `StyleModel` into strict [OGC SLD 1.0](https://docs.ogc.org/is/02-070/02-070.pdf) XML. No LLM ever touches `<sld:...>`.
3. **Manual + AI helpers** (`@openstyle/manual`, `@openstyle/ai`) — a distilled version of the [GeoServer SLD Cookbook](https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/), plus system-prompt builders and field-reference validators, so any AI agent can pick up the format quickly.

## Status

**Early alpha.** APIs will shift as the schema stabilizes.

Extracted from [GeoServer-AI-Style-Studio](https://github.com/gaopengbin/GeoServer-AI-Style-Studio) so the styling grammar can evolve independently of any single application.

## Packages

| Package | Description |
| --- | --- |
| [`@openstyle/schema`](./packages/schema) | `StyleModel` TypeScript type + zod schema + validators |
| [`@openstyle/compiler`](./packages/compiler) | `compileToSld` / `formatSld` — deterministic SLD 1.0 emitter |
| [`@openstyle/openlayers`](./packages/openlayers) | `compileToOpenLayers` — deterministic OpenLayers `StyleFunction` adapter |
| [`@openstyle/manual`](./packages/manual) | Cookbook-distilled prompt manual (scale ladders, palettes, few-shot) |
| [`@openstyle/ai`](./packages/ai) | System-prompt builder + field-reference validators + SLD diff |

## Quick start

```bash
pnpm add @openstyle/schema @openstyle/compiler
```

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
