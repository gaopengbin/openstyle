import { describe, expect, it } from "vitest";
import {
  StyleModelSchema,
  validateStyleModel,
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
});
