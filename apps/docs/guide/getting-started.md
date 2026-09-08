# Getting started

openstyle is a small toolkit for producing OGC SLD styles from a bounded JSON shape — ideal for AI-driven styling workflows.

## Install

Version 0.7.0 is distributed through the [GitHub prerelease](https://github.com/gaopengbin/openstyle/releases/tag/v0.7.0); its npm publication has not been completed. Download `openstyle-0.7.0-bundle.zip`, verify its checksum against the release's `SHA256SUMS`, and extract it. Use pnpm 10.32.1 from the extracted bundle directory:

```bash
cd openstyle-0.7.0-bundle
pnpm install
```

The bundle includes all eight OpenStyle packages. Its `package.json` uses local tarballs and `pnpm.overrides` for internal dependencies, so it does not request unpublished OpenStyle versions from npm. Preserve both `tarballs/` and the overrides when adapting it to your own project. Third-party dependencies still require registry access or a populated pnpm cache; this is not a fully offline dependency bundle.

Use `@openstyle/ai` for model prompts and request policies, `@openstyle/manual` for cookbook material, or `@openstyle/cartography` for controlled map edits and review utilities. The [release instructions](https://github.com/gaopengbin/openstyle/blob/v0.7.0/docs/releasing.md) explain checksums and individual tarballs.

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
