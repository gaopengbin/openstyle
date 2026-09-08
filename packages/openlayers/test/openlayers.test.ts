import { describe, expect, it } from "vitest";
import Feature from "ol/Feature.js";
import { asArray } from "ol/color.js";
import type RegularShape from "ol/style/RegularShape.js";
import type Style from "ol/style/Style.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import Polygon from "ol/geom/Polygon.js";
import type { OpenStyle, StyleModel } from "@openstyle/schema";
import { compileOpenStyleToOpenLayers, compileToOpenLayersStyle } from "../src/index.js";

describe("compileToOpenLayersStyle", () => {
  it("compiles a deterministic line symbolizer with a label", () => {
    const model: StyleModel = {
      name: "roads",
      geom: "line",
      symbolizer: { kind: "line", stroke: "#35d7ff", strokeWidth: 3, dasharray: "6 2" },
      label: { field: "name", fontColor: "#ffffff", placement: { kind: "line", repeat: 120 } },
    };
    const feature = new Feature({ name: "世纪大道", geometry: new LineString([[0, 0], [10, 10]]) });
    const style = compileToOpenLayersStyle(model)(feature, 1);
    const resolved = Array.isArray(style) ? style[0] : style;
    expect(resolved?.getStroke()?.getColor()).toBe("#35d7ff");
    expect(resolved?.getStroke()?.getLineDash()).toEqual([6, 2]);
    expect(resolved?.getText()?.getText()).toBe("世纪大道");
  });

  it("applies classification and fallback", () => {
    const model: StyleModel = {
      name: "roads",
      geom: "line",
      classification: {
        field: "class",
        classes: [{
          label: "primary",
          filter: { op: "in", value: ["primary", "trunk"] },
          symbolizer: { kind: "line", stroke: "#00ffff", strokeWidth: 4 },
        }],
        fallback: { kind: "line", stroke: "#64748b", strokeWidth: 1 },
      },
    };
    const primary = new Feature({ class: "primary", geometry: new LineString([[0, 0], [1, 1]]) });
    const minor = new Feature({ class: "residential", geometry: new LineString([[0, 0], [1, 1]]) });
    const style = compileToOpenLayersStyle(model);
    expect((style(primary, 1) as import("ol/style/Style.js").default).getStroke()?.getWidth()).toBe(4);
    expect((style(minor, 1) as import("ol/style/Style.js").default).getStroke()?.getWidth()).toBe(1);
  });

  it("compiles point and polygon symbolizers", () => {
    const pointModel: StyleModel = {
      name: "poi",
      geom: "point",
      symbolizer: { kind: "point", shape: "star", fill: "#facc15", stroke: "#fff", size: 12 },
    };
    const polygonModel: StyleModel = {
      name: "water",
      geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#0e7490", stroke: "#22d3ee", strokeWidth: 1 },
    };
    const point = new Feature({ geometry: new Point([0, 0]) });
    const polygon = new Feature({ geometry: new Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]) });
    expect((compileToOpenLayersStyle(pointModel)(point, 1) as import("ol/style/Style.js").default).getImage()).toBeTruthy();
    expect((compileToOpenLayersStyle(polygonModel)(polygon, 1) as import("ol/style/Style.js").default).getFill()?.getColor()).toBe("#0e7490");
  });
});

describe("symbolizer opacity", () => {
  const polygon = new Feature({ geometry: new Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]) });

  it.each([0, 0.12])("keeps polygon fill opacity %s independent from its outline", (opacity) => {
    const model: StyleModel = {
      name: "province overlay", geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#123456", fillOpacity: opacity, stroke: "#abcdef", strokeWidth: 2, strokeOpacity: 0.5 },
    };
    const style = compileToOpenLayersStyle(model)(polygon, 1) as Style;
    expect(style.getFill()?.getColor()).toEqual([18, 52, 86, opacity]);
    expect(style.getStroke()?.getColor()).toEqual([171, 205, 239, 0.5]);
    expect(style.getStroke()?.getWidth()).toBe(2);
  });

  it("multiplies line stroke opacity by the color's existing alpha", () => {
    const feature = new Feature({ geometry: new LineString([[0, 0], [1, 1]]) });
    const model: StyleModel = {
      name: "roads", geom: "line",
      symbolizer: { kind: "line", stroke: "rgba(10, 20, 30, 0.5)", strokeWidth: 3, strokeOpacity: 0.4 },
    };
    const style = compileToOpenLayersStyle(model)(feature, 1) as Style;
    expect(style.getStroke()?.getColor()).toEqual([10, 20, 30, 0.2]);
  });

  it.each(["circle", "triangle"])("applies zero fill opacity to %s point symbols without hiding their outlines", (shape) => {
    const feature = new Feature({ geometry: new Point([0, 0]) });
    const model: StyleModel = {
      name: "points", geom: "point",
      symbolizer: { kind: "point", shape, fill: "#f87171", fillOpacity: 0, stroke: "#ffffff", size: 12 },
    };
    const style = compileToOpenLayersStyle(model)(feature, 1) as Style;
    const image = style.getImage() as RegularShape;
    expect(image.getFill()?.getColor()).toEqual([248, 113, 113, 0]);
    expect(image.getStroke()?.getColor()).toBe("#ffffff");
  });

  it("does not mutate cached color alpha across independent compile invocations", () => {
    const color = "rgba(100, 110, 120, 0.5)";
    const compile = (fillOpacity: number) => compileToOpenLayersStyle({
      name: "province", geom: "polygon",
      symbolizer: { kind: "polygon", fill: color, fillOpacity },
    })(polygon, 1) as Style;
    const first = compile(0.12).getFill()?.getColor();
    const second = compile(0.4).getFill()?.getColor();
    expect(first).toEqual([100, 110, 120, 0.06]);
    expect(second).toEqual([100, 110, 120, 0.2]);
    expect(first).not.toBe(second);
    expect(asArray(color)).toEqual([100, 110, 120, 0.5]);
  });
});

describe("compileOpenStyleToOpenLayers", () => {
  it("compiles layer selection, order, background, and capability evidence", () => {
    const style: OpenStyle = {
      schemaVersion: "0.6.0",
      id: "city",
      name: "City map",
      background: "#07111f",
      layers: [
        {
          id: "roads",
          selector: { roles: ["transportation"], sourceLayers: ["transportation"], geometry: "line" },
          zIndex: 4,
          style: {
            name: "roads",
            geom: "line",
            symbolizer: { kind: "line", stroke: "#ffcc66", strokeWidth: 3 },
            label: { field: "name", placement: { kind: "line", group: true } },
          },
        },
        {
          id: "water",
          selector: { roles: ["hydrography"], sourceLayers: ["water"], geometry: "polygon" },
          zIndex: 2,
          style: { name: "water", geom: "polygon", symbolizer: { kind: "polygon", fill: "#0b415c" } },
        },
      ],
    };
    const compiled = compileOpenStyleToOpenLayers(style);
    const road = new Feature({ layer: "transportation", role: "transportation", geometry: new LineString([[0, 0], [1, 1]]) });
    const roadStyle = compiled.styleFunction(road, 1);
    const resolved = Array.isArray(roadStyle) ? roadStyle[0] : roadStyle;
    expect(resolved?.getStroke()?.getColor()).toBe("#ffcc66");
    expect(resolved?.getZIndex()).toBe(4);
    expect(compiled.background).toBe("#07111f");
    expect(compiled.negotiation.ok).toBe(true);
    expect(compiled.negotiation.emulated).toContain("style.label.group");
    expect(compiled.negotiation.warnings).toContain("openlayers emulates style.label.group; inspect rendered evidence before publishing");
  });
});

describe("label scale visibility", () => {
  it.each([
    { geom: "line" as const, symbolizer: { kind: "line" as const, stroke: "#fff", strokeWidth: 3 }, geometry: new LineString([[0, 0], [1, 1]]) },
    { geom: "point" as const, symbolizer: { kind: "point" as const, fill: "#fff", size: 8 }, geometry: new Point([0, 0]) },
    { geom: "polygon" as const, symbolizer: { kind: "polygon" as const, fill: "#fff" }, geometry: new Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]) },
  ])("hides only the text outside a $geom label range and keeps both endpoints", ({ geom, symbolizer, geometry }) => {
    const model: StyleModel = { name: "scaled", geom, symbolizer, label: { field: "name", minScale: 100, maxScale: 1000 } };
    const before = structuredClone(model);
    const feature = new Feature({ name: "Current name", geometry });
    const fn = compileToOpenLayersStyle(model, { pixelSizeMetres: 1, metresPerUnit: 1 });
    for (const denominator of [100, 500, 1000]) expect((fn(feature, denominator) as Style).getText()?.getText()).toBe("Current name");
    for (const denominator of [99, 1001]) {
      const result = fn(feature, denominator) as Style;
      expect(result).toBeTruthy();
      expect(result.getText()).toBeNull();
      if (geom === "line") expect(result.getStroke()?.getWidth()).toBe(3);
      if (geom === "point") expect(result.getImage()).toBeTruthy();
      if (geom === "polygon") expect(result.getFill()?.getColor()).toBe("#fff");
    }
    expect(model).toEqual(before);
  });

  it("keeps classification, fallback scales and core symbols independent from label visibility", () => {
    const model: StyleModel = { name: "classified", geom: "line", classification: {
      field: "class", classes: [{ label: "major", filter: { op: "eq", value: "major" }, scale: { maxScaleDenominator: 2000 }, symbolizer: { kind: "line", stroke: "#fff", strokeWidth: 4 } }],
      fallback: { kind: "line", stroke: "#999", strokeWidth: 1 }, fallbackScale: { maxScaleDenominator: 4000 },
    }, label: { field: "name", maxScale: 1000 } };
    const feature = new Feature({ class: "major", name: "Main", geometry: new LineString([[0, 0], [1, 1]]) });
    const fn = compileToOpenLayersStyle(model, { pixelSizeMetres: 1 });
    expect((fn(feature, 500) as Style).getText()?.getText()).toBe("Main");
    expect((fn(feature, 1500) as Style).getText()).toBeNull();
    expect((fn(feature, 1500) as Style).getStroke()?.getWidth()).toBe(4);
    feature.set("class", "minor");
    expect((fn(feature, 3000) as Style).getText()).toBeNull();
    expect((fn(feature, 3000) as Style).getStroke()?.getWidth()).toBe(1);
    expect(fn(feature, 5000)).toBeUndefined();
  });

  it("applies the OGC denominator conversion inside the whole-map compiler", () => {
    const map: OpenStyle = { schemaVersion: "0.6.0", id: "scale-proof", name: "Scale proof", layers: [{
      id: "roads", zIndex: 12, selector: { sourceLayers: ["road"] }, style: { name: "roads", geom: "line", symbolizer: { kind: "line", stroke: "#fff", strokeWidth: 3 }, label: { field: "name", maxScale: 1000 } },
    }] };
    const feature = new Feature({ layer: "road", name: "Main", geometry: new LineString([[0, 0], [1, 1]]) });
    const fn = compileOpenStyleToOpenLayers(map).styleFunction;
    const near = fn(feature, 0.1) as Style[];
    const far = fn(feature, 10) as Style[];
    expect(near[0]?.getText()?.getText()).toBe("Main");
    expect(far[0]?.getText()).toBeNull();
    expect(far[0]?.getStroke()?.getWidth()).toBe(3);
    expect(far[0]?.getZIndex()).toBe(12);
  });
});

describe("combined source and role selectors", () => {
  const model: StyleModel = { name: "roads", geom: "line", symbolizer: { kind: "line", stroke: "#fff", strokeWidth: 3 } };
  it("requires every declared selector constraint instead of dropping roles when a source is present", () => {
    const map: OpenStyle = { schemaVersion: "0.6.0", id: "selector-proof", name: "Selectors", layers: [{ id: "roads", selector: { sourceLayers: ["road"], roles: ["highway"], geometry: "line" }, style: model }] };
    const fn = compileOpenStyleToOpenLayers(map, { sourceLayerProperty: "source", roleProperty: "roles" }).styleFunction;
    const feature = new Feature({ source: "road", roles: "local", geometry: new LineString([[0, 0], [1, 1]]) });
    expect(fn(feature, 1)).toBeUndefined();
    feature.unset("roles");
    expect(fn(feature, 1)).toBeUndefined();
    feature.set("roles", "highway");
    expect(fn(feature, 1)).toHaveLength(1);
    feature.set("source", "other");
    expect(fn(feature, 1)).toBeUndefined();
    feature.set("source", "road"); feature.set("roles", ["local", "highway"]);
    expect(fn(feature, 1)).toHaveLength(1);
    const wrongGeometry = new Feature({ source: "road", roles: "highway", geometry: new Point([0, 0]) });
    expect(fn(wrongGeometry, 1)).toBeUndefined();
  });
  it("still accepts source-only and role-only selectors independently at the same z-index", () => {
    const map: OpenStyle = { schemaVersion: "0.6.0", id: "single-selectors", name: "Selectors", layers: [
      { id: "source", selector: { sourceLayers: ["road"] }, style: model },
      { id: "role", selector: { roles: ["highway"] }, style: model },
    ] };
    const feature = new Feature({ layer: "road", geometry: new LineString([[0, 0], [1, 1]]) });
    const fn = compileOpenStyleToOpenLayers(map).styleFunction;
    expect(fn(feature, 1)).toHaveLength(1);
    feature.unset("layer"); feature.set("role", "highway");
    expect(fn(feature, 1)).toHaveLength(1);
    feature.set("layer", "road");
    expect(fn(feature, 1)).toHaveLength(2);
  });
});
