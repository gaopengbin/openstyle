# @openstyle/maplibre

Deterministically compiles canonical OpenStyle maps into a MapLibre Style
Specification. Capability negotiation runs before compilation, so unsupported
features fail explicitly instead of being silently dropped.

```ts
import { compileOpenStyleToMapLibre } from "@openstyle/maplibre";

const result = compileOpenStyleToMapLibre(openStyle, {
  sourceData: geojson,
});

new maplibregl.Map({ container, style: result.style });
```

External graphics and generated point shapes are returned as `images` and must
be registered with `Map#addImage` by the host before final render evidence is
captured.
