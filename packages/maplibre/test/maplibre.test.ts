import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import type { OpenStyle } from "@openstyle/schema";
import { compileOpenStyleToMapLibre, mapLibreCapabilityManifest } from "../src/index.js";

// Evaluate the emitted filter with the same expression engine used by our
// installed MapLibre peer, without loading a browser or duplicating semantics.
const mapLibreRequire = createRequire(createRequire(import.meta.url).resolve("maplibre-gl/package.json"));
const { createExpression } = mapLibreRequire("@maplibre/maplibre-gl-style-spec");

const style: OpenStyle = {
  schemaVersion: "0.6.0",
  id: "adventure-map",
  name: "Adventure map",
  background: "#f2e3bb",
  layers: [
    {
      id: "land",
      selector: { sourceLayers: ["landcover"], geometry: "polygon" },
      zIndex: 1,
      style: {
        name: "land",
        geom: "polygon",
        classification: {
          field: "class",
          classes: [{ label: "grass", filter: { op: "eq", value: "grass" }, symbolizer: { kind: "polygon", fill: "#8fcf72", stroke: "#6ca65a", strokeWidth: 1 } }],
          fallback: { kind: "polygon", fill: "#c9ad82" },
        },
      },
    },
    {
      id: "roads",
      selector: { sourceLayers: ["transportation"], geometry: "line" },
      zIndex: 2,
      style: {
        name: "roads",
        geom: "line",
        symbolizer: { kind: "line", stroke: "#b16f43", strokeWidth: 3, dasharray: "4 2", linecap: "round" },
        label: { field: "name", fontSize: 11, haloColor: "#fff7dc", haloWidth: 2, placement: { kind: "line", followLine: true, repeat: 180 } },
      },
    },
    {
      id: "encounters",
      selector: { sourceLayers: ["poi"], geometry: "point" },
      zIndex: 3,
      style: {
        name: "encounters",
        geom: "point",
        symbolizer: { kind: "point", externalGraphic: "/monster.png", fill: "#fff", size: 32 },
      },
    },
  ],
};

describe("MapLibre OpenStyle compiler", () => {
  it("publishes an explicit capability manifest", () => {
    expect(mapLibreCapabilityManifest.adapterId).toBe("maplibre");
    expect(mapLibreCapabilityManifest.capabilities["style.point.external-graphic"]).toBe("native");
    expect(mapLibreCapabilityManifest.capabilities["style.filter.like"]).toBe("unsupported");
  });

  it("compiles ordered polygon, line, label and image layers", () => {
    const result = compileOpenStyleToMapLibre(style, {
      sourceData: { type: "FeatureCollection", features: [] },
    });
    expect(result.negotiation.ok).toBe(true);
    expect(result.style.layers[0]).toMatchObject({ id: "openstyle-background", type: "background" });
    expect(result.style.layers.map((layer) => layer.type)).toEqual(expect.arrayContaining(["fill", "line", "symbol"]));
    expect(result.images).toEqual([{ id: expect.stringMatching(/^external-/), kind: "external", url: "/monster.png", size: 32 }]);
    const road = result.style.layers.find((layer) => layer.id === "roads-rule");
    expect(road).toMatchObject({ type: "line", paint: { "line-color": "#b16f43", "line-dasharray": [4, 2] } });
    expect(result.style.layers.find((layer) => layer.id === "roads-rule-label")).toMatchObject({ type: "symbol" });
  });

  it("requires hosts to name every extension they already consumed", () => {
    const extended = { ...style, extensions: { "geostyle-dem": { enabled: true } } } satisfies OpenStyle;
    expect(() => compileOpenStyleToMapLibre(extended)).toThrow(/extension:geostyle-dem/);
    expect(compileOpenStyleToMapLibre(extended, { consumedExtensions: ["geostyle-dem"] }).negotiation.ok).toBe(true);
  });
});

describe("label and rule scale intersection", () => {
  const road = (scale: { minScaleDenominator?: number; maxScaleDenominator?: number }, label: { minScale?: number; maxScale?: number }): OpenStyle => ({
    schemaVersion: "0.6.0", id: "scale-proof", name: "Scale proof", layers: [{
      id: "roads", selector: { sourceLayers: ["road"] }, style: { name: "roads", geom: "line", symbolizer: { kind: "line", stroke: "#fff", strokeWidth: 3 }, scale, label: { field: "name", ...label } },
    }],
  });

  it("a broader label range cannot display labels outside the parent rule", () => {
    const input = road({ minScaleDenominator: 100, maxScaleDenominator: 1000 }, { minScale: 10, maxScale: 100_000 });
    const before = structuredClone(input);
    const layers = compileOpenStyleToMapLibre(input).style.layers;
    const core = layers.find(layer => layer.id === "roads-rule")!;
    const label = layers.find(layer => layer.id === "roads-rule-label")!;
    expect(label.minzoom).toBeCloseTo(19.092701052987117, 10);
    expect(label.minzoom).toBe(core.minzoom);
    expect(label.maxzoom).toBe(core.maxzoom);
    expect(input).toEqual(before);
  });

  it("uses whichever bound is tighter while preserving the core range and paint", () => {
    const layers = compileOpenStyleToMapLibre(road({ minScaleDenominator: 100, maxScaleDenominator: 100_000 }, { minScale: 1000, maxScale: 10_000 })).style.layers;
    const core = layers.find(layer => layer.id === "roads-rule")!;
    const label = layers.find(layer => layer.id === "roads-rule-label")!;
    expect(label.minzoom).toBeGreaterThan(core.minzoom!);
    expect(label.maxzoom).toBeLessThan(core.maxzoom!);
    expect(label.minzoom).toBeCloseTo(15.770772958099754, 10);
    expect(label.maxzoom).toBeCloseTo(19.092701052987117, 10);
    expect(core).toMatchObject({ paint: { "line-width": 3, "line-color": "#fff" } });
  });

  it.each([{ minScale: 5000 }, { maxScale: 500 }, { maxScale: 0 }])("omits an impossible label interval %j without hiding its core", label => {
    const layers = compileOpenStyleToMapLibre(road({ minScaleDenominator: 1000, maxScaleDenominator: 2000 }, label)).style.layers;
    expect(layers.map(layer => layer.id)).toEqual(["roads-rule"]);
    expect(layers[0]).toMatchObject({ paint: { "line-width": 3 } });
  });

  it("intersects every classification and fallback range separately", () => {
    const input = road({}, { minScale: 1000, maxScale: 10_000 });
    const model = input.layers[0]!.style;
    delete model.symbolizer;
    model.classification = { field: "class", classes: [
      { label: "major", filter: { op: "eq", value: "major" }, scale: { minScaleDenominator: 2000, maxScaleDenominator: 5000 }, symbolizer: { kind: "line", stroke: "#fff", strokeWidth: 4 } },
      { label: "minor", filter: { op: "eq", value: "minor" }, scale: { maxScaleDenominator: 500 }, symbolizer: { kind: "line", stroke: "#aaa", strokeWidth: 1 } },
    ], fallback: { kind: "line", stroke: "#888", strokeWidth: 0.5 }, fallbackScale: { maxScaleDenominator: 2000 } };
    const layers = compileOpenStyleToMapLibre(input).style.layers;
    const classCore = layers.find(layer => layer.id === "roads-class-0")!;
    const classLabel = layers.find(layer => layer.id === "roads-class-0-label")!;
    expect(classLabel.minzoom).toBe(classCore.minzoom);
    expect(classLabel.maxzoom).toBe(classCore.maxzoom);
    expect(layers.find(layer => layer.id === "roads-class-1-label")).toBeUndefined();
    expect(layers.find(layer => layer.id === "roads-class-1")).toBeTruthy();
    const fallback = layers.find(layer => layer.id === "roads-fallback-label")!;
    expect(fallback.minzoom).toBe(layers.find(layer => layer.id === "roads-fallback")!.minzoom);
    expect(fallback.maxzoom).toBeCloseTo(19.092701052987117, 10);
  });

  it("keeps unspecified label bounds and minScale zero unrestricted", () => {
    const layers = compileOpenStyleToMapLibre(road({}, { minScale: 0 })).style.layers;
    const label = layers.find(layer => layer.id === "roads-rule-label")!;
    expect(label).not.toHaveProperty("minzoom");
    expect(label).not.toHaveProperty("maxzoom");
  });
});

describe("MapLibre role selector expressions", () => {
  const input: OpenStyle = { schemaVersion: "0.6.0", id: "role-proof", name: "Role proof", layers: [{
    id: "roads", selector: { sourceLayers: ["road"], roles: ["highway", "primary"] },
    style: { name: "roads", geom: "line", symbolizer: { kind: "line", stroke: "#fff", strokeWidth: 3 } },
  }] };
  const compiled = compileOpenStyleToMapLibre(input, { roleProperty: "semantic_roles" });
  const layer = compiled.style.layers.find(layer => layer.id === "roads-rule")!;
  const expression = createExpression("filter" in layer ? layer.filter : undefined, "layers[0].filter");

  it("produces a valid MapLibre expression without modifying the selector", () => {
    expect(expression.result).toBe("success");
    expect(input.layers[0]?.selector).toEqual({ sourceLayers: ["road"], roles: ["highway", "primary"] });
  });

  it.each([
    { role: "highway", expected: true },
    { role: "local", expected: false },
    { role: ["local", "highway"], expected: true },
    { role: ["primary"], expected: true },
    { role: ["local", "park"], expected: false },
    { role: [], expected: false },
    { role: null, expected: false },
    { role: undefined, expected: false },
  ])("evaluates scalar/array/missing role $role as $expected", ({ role, expected }) => {
    expect(expression.result).toBe("success");
    const properties = { layer: "road", ...(role === undefined ? {} : { semantic_roles: role }) };
    expect(expression.value.evaluate({ zoom: 10 }, { properties })).toBe(expected);
  });

  it("still requires the source condition when any declared role matches", () => {
    expect(expression.value.evaluate({ zoom: 10 }, { properties: { layer: "other", semantic_roles: ["highway", "primary"] } })).toBe(false);
  });
});
