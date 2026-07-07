# Getting started

openstyle is a small toolkit for producing OGC SLD styles from a bounded JSON shape — ideal for AI-driven styling workflows.

## Install

```bash
pnpm add @openstyle/schema @openstyle/compiler
```

Add `@openstyle/ai` if you're calling an LLM, or `@openstyle/manual` for cookbook reference material.

## Minimum viable example

```ts
import { StyleModelSchema } from "@openstyle/schema";
import { compileToSld } from "@openstyle/compiler";

const model = StyleModelSchema.parse({
  name: "roads",
  geom: "line",
  symbolizer: { kind: "line", stroke: "#334155", strokeWidth: 1.2 },
});

const sld = compileToSld(model);
// POST sld to GeoServer /rest/workspaces/<ws>/styles or drop it inline
// into a WMS GetMap request via SLD_BODY.
```

## Where to look next

- Package READMEs in the repo cover their own API surface in more detail.
- The [GeoServer SLD Cookbook](https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/) is still the canonical reference for what SLD 1.0 can do — openstyle's schema deliberately shadows a subset of it.

More guides are coming.
