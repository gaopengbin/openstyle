# @openstyle/schema

> The canonical `StyleModel` shape — a bounded JSON grammar for map styling, with runtime validation via [zod](https://zod.dev).

## Install

```bash
pnpm add @openstyle/schema zod
```

## Usage

```ts
import { StyleModelSchema, validateStyleModel } from "@openstyle/schema";

// Strict parse — throws on any violation. Use when input is authoritative
// (e.g. LLM output you're about to compile).
const model = StyleModelSchema.parse({
  name: "roads",
  geom: "line",
  symbolizer: { kind: "line", stroke: "#334155", strokeWidth: 1.2 },
});

// Human-readable diagnostics — for UIs that render errors + warnings inline.
const result = validateStyleModel(model);
// { ok: true, errors: [], warnings: [] }
```

## Shape

```ts
type StyleModel = {
  name: string;
  title?: string;
  geom: "point" | "line" | "polygon";
  symbolizer?: AnySymbolizer;              // single-rule styling
  classification?: {                       // attribute-based (choropleth / categorical)
    field: string;
    classes: Array<{
      label: string;
      filter: { op: "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"between"|"in"|"like"; value: string | number | (string|number)[] };
      symbolizer: AnySymbolizer;
    }>;
    fallback?: AnySymbolizer;              // else-rule
  };
  label?: {                                // TextSymbolizer overlay
    field: string;
    fontFamily?: string; fontSize?: number; fontColor?: string;
    haloColor?: string; haloWidth?: number;
    minScale?: number; maxScale?: number;
  };
};
```

**Invariants** (enforced by `refine`):

- A model must have **either** `symbolizer` **or** `classification`.
- `classification.classes` must have at least one entry.

## What this is *not*

- Not an SLD parser (yet). Use [`@openstyle/compiler`](../compiler) to emit SLD from a `StyleModel`.
- Not a superset of SLD 1.0. It's an opinionated subset covering the practical cases in the [GeoServer SLD Cookbook](https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/).
- Not tied to any specific GeoServer version. The shape is renderer-agnostic within SLD 1.0 compatibility.

## Roadmap

- Scale layering on rules (`minScaleDenominator` / `maxScaleDenominator` at the class/symbolizer level).
- Multi-symbolizer rules (stacked point + label, etc.).
- Named color palettes (ColorBrewer, viridis) as first-class references.

## License

MIT
