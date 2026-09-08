# @openstyle/manual

> Cookbook-distilled reference material for AI-driven map styling. Scale ladders, named palettes, and few-shot examples.

**Status: bootstrap.** The API surface is in place, the content isn't. Contributions welcome — see below.

## Install

Version 0.7.0 is distributed in the [GitHub prerelease bundle](https://github.com/gaopengbin/openstyle/releases/tag/v0.7.0). Extract `openstyle-0.7.0-bundle.zip` and run `pnpm install` from its directory. Keep its local tarballs and `pnpm.overrides` when integrating these packages. Third-party dependencies still require registry access or a populated cache; npm publication of this version is pending.

## What's inside

| Export | Purpose |
| --- | --- |
| `DEFAULT_SCALE_LADDER` | Named scale ranges suitable for web-map zoom levels |
| `PALETTES` | ColorBrewer / viridis / categorical palettes, keyed by id |
| `FEW_SHOT_EXAMPLES` | Curated `(prompt, StyleModel)` pairs to inject into system prompts |
| `findPalette(id)` / `findScaleTier(id)` | Convenience lookups |

## Planned content

- Palettes distilled from ColorBrewer (sequential, diverging, categorical) and viridis / cividis / turbo.
- Scale ladders keyed to standard web-map zoom levels (Z2 → Z18) with typical dpi assumptions.
- Few-shot examples covering the common asks: choropleth by numeric field, categorical fill by string field, graduated line width, halo labels, external graphic markers.
- Field-type → styling-strategy heuristics.

## Contributing

Palette / few-shot PRs are especially welcome. Include the source (ColorBrewer citation, screenshot from a real map, etc.) so downstream tools can attribute correctly.

## References

- [ColorBrewer 2.0](https://colorbrewer2.org/)
- [Viridis colormap](https://bids.github.io/colormap/)
- [GeoServer SLD Cookbook](https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/)

## License

MIT
