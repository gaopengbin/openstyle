import { describe, expect, it } from "vitest";
import {
  OpenStyleSchema,
  StyleModelSchema,
  validateOpenStyle,
  validateStyleModel,
  type OpenStyle,
  type StyleModel,
} from "../src/index.js";

describe("StyleModelSchema", () => {
  it("accepts a minimal single-symbolizer polygon", () => {
    const model: StyleModel = {
      name: "hello",
      geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#e5e7eb" },
    };
    expect(StyleModelSchema.parse(model)).toEqual(model);
  });

  it("accepts a classification with two classes", () => {
    const model: StyleModel = {
      name: "pop_choropleth",
      geom: "polygon",
      classification: {
        field: "POP",
        classes: [
          { label: "Low", filter: { op: "lt", value: 100 }, symbolizer: { kind: "polygon", fill: "#eee" } },
          { label: "High", filter: { op: "gte", value: 100 }, symbolizer: { kind: "polygon", fill: "#123456" } },
        ],
      },
    };
    expect(() => StyleModelSchema.parse(model)).not.toThrow();
  });

  it("rejects a model with neither symbolizer nor classification", () => {
    const bad = { name: "nope", geom: "polygon" };
    expect(StyleModelSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty classification.classes[]", () => {
    const bad = {
      name: "x",
      geom: "polygon",
      classification: { field: "F", classes: [] },
    };
    expect(StyleModelSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts class-level and fallback scale ranges", () => {
    const model: StyleModel = {
      name: "roads",
      geom: "line",
      classification: {
        field: "type",
        classes: [
          {
            label: "highway",
            filter: { op: "eq", value: "hwy" },
            symbolizer: { kind: "line", stroke: "#000", strokeWidth: 2 },
            scale: { maxScaleDenominator: 5_000_000 },
          },
        ],
        fallback: { kind: "line", stroke: "#999", strokeWidth: 0.5 },
        fallbackScale: { maxScaleDenominator: 50_000 },
      },
    };
    expect(() => StyleModelSchema.parse(model)).not.toThrow();
  });

  it("accepts top-level scale on single-symbolizer models", () => {
    const model: StyleModel = {
      name: "detail",
      geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#eee" },
      scale: { minScaleDenominator: 1_000, maxScaleDenominator: 50_000 },
    };
    expect(() => StyleModelSchema.parse(model)).not.toThrow();
  });

  it("rejects scale ranges where min > max", () => {
    const bad = {
      name: "x",
      geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#fff" },
      scale: { minScaleDenominator: 5_000_000, maxScaleDenominator: 5_000 },
    };
    expect(StyleModelSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts line label placement on line geometry", () => {
    const model: StyleModel = {
      name: "roads_labeled",
      geom: "line",
      symbolizer: { kind: "line", stroke: "#000", strokeWidth: 1 },
      label: {
        field: "name",
        placement: {
          kind: "line",
          followLine: true,
          repeat: 150,
          maxDisplacement: 50,
        },
      },
    };
    expect(() => StyleModelSchema.parse(model)).not.toThrow();
  });

  it("rejects line label placement on polygon geometry", () => {
    const bad = {
      name: "areas",
      geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#eee" },
      label: {
        field: "name",
        placement: { kind: "line", followLine: true },
      },
    };
    expect(StyleModelSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts point label placement on line geometry (anchor/offset)", () => {
    const model: StyleModel = {
      name: "roads_centroid_labels",
      geom: "line",
      symbolizer: { kind: "line", stroke: "#000", strokeWidth: 1 },
      label: {
        field: "name",
        placement: { kind: "point", anchorX: 0.5, anchorY: 0.5, offsetY: -6 },
      },
    };
    expect(() => StyleModelSchema.parse(model)).not.toThrow();
  });
});

describe("OpenStyleSchema", () => {
  const style: OpenStyle = {
    schemaVersion: "0.6.0",
    id: "city-night",
    name: "City night",
    background: "#07111f",
    layers: [{
      id: "roads",
      selector: { roles: ["transportation"], sourceLayers: ["transportation"], geometry: "line" },
      zIndex: 5,
      style: { name: "roads", geom: "line", symbolizer: { kind: "line", stroke: "#ffd166", strokeWidth: 3 } },
    }],
  };

  it("accepts a canonical whole-map style", () => {
    expect(OpenStyleSchema.parse(style).layers[0]?.style.name).toBe("roads");
    expect(validateOpenStyle(style).ok).toBe(true);
  });

  it("rejects duplicate layer ids and mismatched selector geometry", () => {
    expect(OpenStyleSchema.safeParse({ ...style, layers: [...style.layers, style.layers[0]] }).success).toBe(false);
    expect(OpenStyleSchema.safeParse({
      ...style,
      layers: [{ ...style.layers[0], selector: { roles: ["transportation"], geometry: "polygon" } }],
    }).success).toBe(false);
  });
});

describe("validateStyleModel", () => {
  it("returns ok=true and no errors for a valid model", () => {
    const r = validateStyleModel({
      name: "x",
      geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#fff" },
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("emits a fallback warning when classification has no fallback", () => {
    const r = validateStyleModel({
      name: "x",
      geom: "polygon",
      classification: {
        field: "F",
        classes: [
          { label: "a", filter: { op: "eq", value: 1 }, symbolizer: { kind: "polygon", fill: "#111" } },
        ],
      },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes("fallback"))).toBe(true);
  });

  it("returns ok=false with human paths for malformed input", () => {
    const r = validateStyleModel({ name: "", geom: "polygon" });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("warns when top-level scale is set alongside classification", () => {
    const r = validateStyleModel({
      name: "x",
      geom: "polygon",
      scale: { maxScaleDenominator: 50_000 },
      classification: {
        field: "F",
        classes: [
          {
            label: "a",
            filter: { op: "eq", value: 1 },
            symbolizer: { kind: "polygon", fill: "#111" },
          },
        ],
        fallback: { kind: "polygon", fill: "#999" },
      },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes("top-level `scale`"))).toBe(true);
  });
});
