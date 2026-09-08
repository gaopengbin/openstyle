# @openstyle/compiler

> Deterministic OGC SLD 1.0.0 emitter. Takes a validated [`@openstyle/schema`](../schema) `StyleModel` and returns strict SLD XML — same input, byte-identical output.

## Install

Version 0.7.0 is distributed in the [GitHub prerelease bundle](https://github.com/gaopengbin/openstyle/releases/tag/v0.7.0). Extract `openstyle-0.7.0-bundle.zip` and run `pnpm install` from its directory. Keep its local tarballs and `pnpm.overrides` when integrating these packages. Third-party dependencies still require registry access or a populated cache; npm publication of this version is pending.

## Usage

```ts
import { StyleModelSchema } from "@openstyle/schema";
import { compileToSld, formatSld } from "@openstyle/compiler";

const model = StyleModelSchema.parse({
  name: "roads",
  geom: "line",
  symbolizer: { kind: "line", stroke: "#334155", strokeWidth: 1.2 },
});

const sld = compileToSld(model);
// Send `sld` to GeoServer REST /styles or bake it into a WMS request.
```

## Supported features

- Point / Line / Polygon symbolizers (with fill, stroke, dash, opacity, well-known marks, external graphics).
- TextSymbolizer overlay via `label` (font, halo).
- Attribute filters: `eq / neq / gt / gte / lt / lte / between / in / like`.
- Classification with optional `ElseFilter` fallback.

## Determinism

The compiler never reads clocks or randomness. Two calls with the same `StyleModel` return byte-identical strings — safe for snapshot testing, cache keys, and diff-based UIs.

## Roadmap

- Rule-level `MinScaleDenominator` / `MaxScaleDenominator` (once the schema exposes it).
- Multi-symbolizer rules (point + label stacked).
- SLD 1.1 / Symbology Encoding 1.1 output as an alternative emitter.

## References

- [OGC SLD 1.0.0 (02-070)](https://docs.ogc.org/is/02-070/02-070.pdf)
- [GeoServer SLD Cookbook](https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/)

## License

MIT
