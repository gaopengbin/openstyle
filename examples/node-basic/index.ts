/**
 * Minimal openstyle example.
 *
 * Run with:
 *   pnpm --filter @openstyle/example-node-basic run start
 *
 * The output is deterministic SLD 1.0 XML — the same input produces the
 * same bytes every time.
 */
import { StyleModelSchema } from "@openstyle/schema";
import { compileToSld } from "@openstyle/compiler";

const model = StyleModelSchema.parse({
  name: "population_choropleth",
  title: "Population choropleth",
  geom: "polygon",
  classification: {
    field: "POP_DENS",
    classes: [
      {
        label: "Low",
        filter: { op: "lt", value: 100 },
        symbolizer: { kind: "polygon", fill: "#f7fbff", stroke: "#c6dbef", strokeWidth: 0.5 },
      },
      {
        label: "Mid",
        filter: { op: "between", value: [100, 1000] },
        symbolizer: { kind: "polygon", fill: "#6baed6", stroke: "#3182bd", strokeWidth: 0.5 },
      },
      {
        label: "High",
        filter: { op: "gte", value: 1000 },
        symbolizer: { kind: "polygon", fill: "#08306b", stroke: "#08306b", strokeWidth: 0.5 },
      },
    ],
    fallback: { kind: "polygon", fill: "#9CA3AF" },
  },
  label: {
    field: "NAME",
    fontSize: 11,
    fontColor: "#111827",
    haloColor: "#ffffff",
    haloWidth: 1,
  },
});

const sld = compileToSld(model);
console.log(sld);
