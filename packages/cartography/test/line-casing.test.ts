import { describe, expect, it } from "vitest";
import type { StyleModel } from "@openstyle/schema";
import { applyLineCasing, LineCasingSchema } from "../src/line-casing.js";

const road: StyleModel = {
  name: "roads", geom: "line", extensions: { application: { keep: true } },
  classification: {
    field: "class", classes: [
      { label: "Primary", filter: { op: "in", value: ["primary", "trunk"] }, scale: { maxScaleDenominator: 100_000 }, symbolizer: { kind: "line", stroke: "#fff", strokeWidth: 5, strokeOpacity: 0.8, linecap: "round", linejoin: "round" } },
      { label: "Local", filter: { op: "eq", value: "local" }, scale: { maxScaleDenominator: 50_000 }, symbolizer: { kind: "line", stroke: "#ddd", strokeWidth: 1.5, dasharray: "4 2" } },
    ], fallback: { kind: "line", stroke: "#aaa", strokeWidth: 0.5 }, fallbackScale: { maxScaleDenominator: 20_000 },
  },
  label: { field: "name", fontSize: 12, placement: { kind: "line", followLine: true } },
};

describe("portable line casing", () => {
  it("derives every rule independently while preserving filters, scales and caller extensions", () => {
    const input = { ...structuredClone(road), callerMetadata: { sourceRevision: 7 } };
    const before = structuredClone(input);
    const result = applyLineCasing(input, { color: "#123456", width: 0.75 });
    expect(result.classification?.classes.map(entry => entry.symbolizer.strokeWidth)).toEqual([6.5, 3]);
    expect(result.classification?.fallback?.strokeWidth).toBe(2);
    expect(result.classification?.classes.map(entry => entry.filter)).toEqual(road.classification?.classes.map(entry => entry.filter));
    expect(result.classification?.classes.map(entry => entry.scale)).toEqual(road.classification?.classes.map(entry => entry.scale));
    expect(result.classification?.fallbackScale).toEqual(road.classification?.fallbackScale);
    expect(result.classification?.classes[0]?.symbolizer).toMatchObject({ stroke: "#123456", strokeOpacity: 0.8, linecap: "round", linejoin: "round" });
    expect(result.classification?.classes[1]?.symbolizer).toMatchObject({ dasharray: "4 2" });
    expect(result).not.toHaveProperty("label");
    expect(result.extensions).toEqual(road.extensions);
    expect(result.callerMetadata).toEqual({ sourceRevision: 7 });
    result.callerMetadata.sourceRevision = 8;
    expect(input).toEqual(before);
  });

  it("preserves a single rule scale without modifying its core width", () => {
    const input: StyleModel = { name: "single", geom: "line", symbolizer: { kind: "line", stroke: "#abc", strokeWidth: 1 }, scale: { minScaleDenominator: 100, maxScaleDenominator: 20_000 } };
    expect(applyLineCasing(input, { color: "#1234", width: 2 })).toMatchObject({ scale: input.scale, symbolizer: { strokeWidth: 5 } });
    expect(input.symbolizer?.strokeWidth).toBe(1);
  });

  it.each([
    { stroke: "#fff", strokeWidth: 0 },
    { stroke: "#fff", strokeWidth: 3, strokeOpacity: 0 },
    ...["transparent", "none", "#fff0", "#ffffff00", "rgba(0, 0, 0, 0)", "rgb(0 0 0 / 0%)", "hsl(0 0% 0% / 0)"].map(stroke => ({ stroke, strokeWidth: 3 })),
  ])("does not reveal hidden strokes: $stroke", symbolizer => {
    const input: StyleModel = { name: "hidden", geom: "line", symbolizer: { kind: "line", ...symbolizer }, label: { field: "name" } };
    const result = applyLineCasing(input, { color: "#fff", width: 2 });
    expect(result.symbolizer?.strokeWidth === 0 || result.symbolizer?.kind === "line" && result.symbolizer.strokeOpacity === 0).toBe(true);
    expect(result).not.toHaveProperty("label");
  });

  it("rejects non-line models and mixed-kind line rules", () => {
    const point: StyleModel = { name: "point", geom: "point", symbolizer: { kind: "point", fill: "#fff", size: 3 } };
    expect(() => applyLineCasing(point, { color: "#fff", width: 1 })).toThrow(/line StyleModels/);
    expect(() => applyLineCasing({ ...point, geom: "line" }, { color: "#fff", width: 1 })).toThrow(/symbolizer/);
  });

  it.each([0, -1, 6.01, NaN, Infinity])("rejects invalid width %s", width => {
    expect(() => applyLineCasing(road, { color: "#fff", width })).toThrow();
  });
  it.each(["red", "#12", "#12345", "#xyzzzz", "url(https://example.test)"])("rejects invalid color %s", color => {
    expect(() => applyLineCasing(road, { color, width: 1 })).toThrow();
  });
  it("bounds the complete options and permits supported hex lengths", () => {
    for (const color of ["#abc", "#abcd", "#ABCDEF", "#abcdef80"]) expect(LineCasingSchema.parse({ color, width: 6 })).toEqual({ color, width: 6 });
    expect(() => LineCasingSchema.parse({ color: "#fff", width: 1, opacity: 0.5 })).toThrow();
  });
});
