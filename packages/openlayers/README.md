# @openstyle/openlayers

Deterministically compiles an OpenStyle `StyleModel` into an OpenLayers
`StyleFunction`. The same canonical model can therefore target GeoServer SLD
through `@openstyle/compiler` or a local OpenLayers preview through this
package.

```ts
import { compileToOpenLayersStyle } from "@openstyle/openlayers";

const style = compileToOpenLayersStyle({
  name: "roads",
  geom: "line",
  symbolizer: { kind: "line", stroke: "#35d7ff", strokeWidth: 3 },
});
```
