import { describe, expect, it } from "vitest";
import type { OpenStyle, OpenStyleLayer } from "@openstyle/schema";
import { applyLineCasing } from "../src/line-casing.js";
import { applyOpenStylePatch, summarizeOpenStyle, type OpenStylePatch, type OpenStylePatchProfile } from "../src/style-patch.js";

function fixture() {
  const core: OpenStyleLayer = { id: "roads", zIndex: 83, selector: { sourceLayers: ["road"], sourceRef: "source://city", geometry: "line" }, style: {
    name: "roads", geom: "line", classification: { field: "class", classes: [
      { label: "Primary", filter: { op: "eq", value: "primary" }, scale: { maxScaleDenominator: 100_000 }, symbolizer: { kind: "line", stroke: "#eee", strokeWidth: 3 } },
      { label: "Local", filter: { op: "eq", value: "local" }, symbolizer: { kind: "line", stroke: "#bbb", strokeWidth: 1 } },
    ], fallback: { kind: "line", stroke: "#aaa", strokeWidth: 0.5 } }, label: { field: "name", maxScale: 20_000, placement: { kind: "line", followLine: true } }, extensions: { custom: { untouched: true } },
  } };
  const style: OpenStyle & { callerMetadata: { revision: number } } = {
    schemaVersion: "0.6.0" as const, id: "city-v1", name: "City map", background: "#fff", callerMetadata: { revision: 2 },
    layers: [
      { id: "water", zIndex: -3, selector: { sourceLayers: ["water"] }, style: { name: "water", geom: "polygon" as const, symbolizer: { kind: "polygon" as const, fill: "#abc", strokeWidth: 1 } } },
      { id: "roads_underlay", zIndex: 82, selector: structuredClone(core.selector), style: applyLineCasing(core.style, { color: "#222", width: 1 }), extensions: { caller: { preserve: "underlay" } } }, core,
    ],
  };
  const profile: OpenStylePatchProfile = { sourceId: "source://city", layers: [{ id: "road", geometry: "line", fields: ["name", "class"] }, { id: "water", geometry: "polygon", fields: ["name"] }] };
  const patch: OpenStylePatch = { baseStyleId: style.id, sourceId: profile.sourceId, operations: [{ op: "replace", layerId: "roads", path: "/casing/width", value: 2 }] };
  return { style, profile, patch, resultId: "city-v2" };
}

describe("atomic portable style patches", () => {
  it("changes casing leaves without changing cores, selectors, unrelated layers or caller extensions", () => {
    const input = fixture();
    input.patch.operations.push({ op: "replace", layerId: "roads", path: "/casing/color", value: "#123456" });
    input.patch.notes = { unsupported: ["No terrain source"], missingData: [] };
    const before = structuredClone(input);
    const result = applyOpenStylePatch(input);
    expect(input).toEqual(before);
    expect(result.style.id).toBe("city-v2");
    expect(result.style.callerMetadata).toEqual({ revision: 2 });
    expect(result.style.layers.filter(layer => layer.id !== "roads_underlay")).toEqual(input.style.layers.filter(layer => layer.id !== "roads_underlay"));
    expect(result.style.layers.find(layer => layer.id === "roads_underlay")).toEqual({ ...input.style.layers[1], style: applyLineCasing(input.style.layers[2]!.style, { color: "#123456", width: 2 }) });
    expect(result.changeSummary).toEqual({ mode: "patch", changedLayerIds: ["roads"], changedFields: [
      { layerId: "roads", sourceLayer: "road", path: "/casing/width" }, { layerId: "roads", sourceLayer: "road", path: "/casing/color" },
    ], unsupported: ["No terrain source"], missingData: [] });
    expect(summarizeOpenStyle(result.style).layers.find(layer => layer.layerId === "roads")).toMatchObject({ casing: { color: "#123456", width: 2 }, zIndex: 83 });
  });

  it("validates all operations before returning and leaves the input untouched after a later failure", () => {
    const input = fixture();
    input.patch.operations.push({ op: "replace", layerId: "roads", path: "/label/field", value: "invented" });
    const before = structuredClone(input);
    expect(() => applyOpenStylePatch(input)).toThrow(/not present/);
    expect(input).toEqual(before);
  });

  it.each([
    ["/casing/width", 0], ["/casing/width", -1], ["/casing/width", 6.01], ["/casing/width", Infinity], ["/casing/width", "2"],
    ["/casing/color", "red"], ["/casing/color", "#xx1234"], ["/casing/color", null], ["/casing/color", undefined],
  ])("rejects invalid %s=%s", (path, value) => {
    const input = fixture(); input.patch.operations[0] = { op: "replace", layerId: "roads", path: path as string, value };
    expect(() => applyOpenStylePatch(input)).toThrow();
  });

  it.each(["/casing/opacity", "/casing/width/value", "/casing/__proto__", "/symbolizer/constructor", "/extensions/custom", "/classification/classes/0/filter/field"])("rejects unapproved path %s", path => {
    const input = fixture(); input.patch.operations[0]!.path = path;
    expect(() => applyOpenStylePatch(input)).toThrow(/Unsupported style patch path/);
  });

  it("requires complete casing before leaf edits and permits creating it within the same transaction", () => {
    const input = fixture(); input.style.layers.splice(1, 1);
    expect(() => applyOpenStylePatch(input)).toThrow(/Replace \/casing with a complete/);
    input.patch.operations.unshift({ op: "replace", layerId: "roads", path: "/casing", value: { color: "#111", width: 1 } });
    expect(summarizeOpenStyle(applyOpenStylePatch(input).style).layers.find(layer => layer.layerId === "roads")?.casing).toEqual({ color: "#111", width: 2 });
  });

  it("supports explicit complete removal but forbids removing required casing leaves", () => {
    const input = fixture(); input.patch.operations = [{ op: "remove", layerId: "roads", path: "/casing/width" }];
    expect(() => applyOpenStylePatch(input)).toThrow(/Remove \/casing/);
    input.patch.operations[0]!.path = "/casing";
    expect(applyOpenStylePatch(input).style.layers.map(layer => layer.id)).toEqual(["water", "roads"]);
  });

  it("preserves an unobservable hidden casing unless removal is explicit", () => {
    const input = fixture(); const core = input.style.layers[2]!;
    core.style = { name: "hidden", geom: "line", symbolizer: { kind: "line", stroke: "#fff", strokeWidth: 0 }, label: { field: "name" } };
    input.style.layers[1]!.style = applyLineCasing(core.style, { color: "#222", width: 3 });
    expect(summarizeOpenStyle(input.style).layers.find(layer => layer.layerId === "roads")).toMatchObject({ underlayId: "roads_underlay" });
    expect(summarizeOpenStyle(input.style).layers.find(layer => layer.layerId === "roads")).not.toHaveProperty("casing");
    input.patch.operations = [{ op: "replace", layerId: "roads", path: "/label/fontSize", value: 10 }];
    expect(applyOpenStylePatch(input).style.layers[1]).toEqual(input.style.layers[1]);
    input.patch.operations = [{ op: "remove", layerId: "roads", path: "/casing" }];
    expect(applyOpenStylePatch(input).style.layers.map(layer => layer.id)).toEqual(["water", "roads"]);
  });

  it("does not overwrite an independent layer whose id happens to end in _underlay", () => {
    const input = fixture(); input.style.layers[1]!.selector = { sourceLayers: ["other"] };
    expect(summarizeOpenStyle(input.style).layers).toHaveLength(3);
    expect(() => applyOpenStylePatch(input)).toThrow(/conflicts with an independent layer/);
  });

  it("does not identify or overwrite caller-specific underlay style metadata as generated casing", () => {
    const input = fixture();
    Object.assign(input.style.layers[1]!.style, { callerStyleMetadata: { revision: 9 } });
    const before = structuredClone(input);
    expect(() => applyOpenStylePatch(input)).toThrow(/conflicts with an independent layer/);
    expect(input).toEqual(before);
  });

  it("rejects stale versions, mismatched sources, ambiguous bindings, and duplicate identifiers", () => {
    const cases = [
      (input: ReturnType<typeof fixture>) => { input.patch.baseStyleId = "old"; },
      (input: ReturnType<typeof fixture>) => { input.patch.sourceId = "other"; },
      (input: ReturnType<typeof fixture>) => { input.patch.operations[0]!.sourceLayer = "water"; },
      (input: ReturnType<typeof fixture>) => { input.style.layers[2]!.selector.sourceLayers = ["road", "water"]; },
      (input: ReturnType<typeof fixture>) => { input.style.layers[2]!.selector.sourceRef = "other"; },
      (input: ReturnType<typeof fixture>) => { input.profile.layers.push(input.profile.layers[0]!); },
      (input: ReturnType<typeof fixture>) => { input.style.layers.push(structuredClone(input.style.layers[2]!)); },
    ];
    for (const alter of cases) { const input = fixture(); alter(input); expect(() => applyOpenStylePatch(input)).toThrow(); }
  });

  it("supports real label and class scale edits and rejects fields ignored by the geometry schema", () => {
    const input = fixture(); input.patch.operations = [
      { op: "replace", layerId: "roads", path: "/label/maxScale", value: 5000 },
      { op: "replace", layerId: "roads", path: "/classification/classes/0/scale/maxScaleDenominator", value: 50_000 },
    ];
    const result = applyOpenStylePatch(input);
    expect(result.style.layers[2]!.style.label?.maxScale).toBe(5000);
    expect(result.style.layers[1]!.style.classification?.classes[0]?.scale?.maxScaleDenominator).toBe(50_000);
    input.patch.operations = [{ op: "replace", layerId: "roads", path: "/classification/classes/0/symbolizer/fill", value: "#fff" }];
    expect(() => applyOpenStylePatch(input)).toThrow(/unsupported by this style geometry/);
    input.patch.operations = [{ op: "replace", layerId: "roads", path: "/classification/field", value: "fictional" }];
    expect(() => applyOpenStylePatch(input)).toThrow(/Classification field fictional/);
  });

  it("retains exact small changes and rejects actual no-op or reverted transactions", () => {
    const input = fixture(); input.patch.operations = [{ op: "replace", layerId: "water", path: "/symbolizer/strokeWidth", value: 1.0000001 }];
    expect(applyOpenStylePatch(input).style.layers[0]!.style.symbolizer?.strokeWidth).toBe(1.0000001);
    input.patch.operations.push({ op: "replace", layerId: "water", path: "/symbolizer/strokeWidth", value: 1 });
    expect(() => applyOpenStylePatch(input)).toThrow(/did not change/);
  });

  it("changes only a valid global background with no fabricated layer change", () => {
    const input = fixture(); input.patch.operations = [{ op: "replace", path: "/background", value: "#123456" }];
    const result = applyOpenStylePatch(input);
    expect(result.style.layers).toEqual(input.style.layers);
    expect(result.changeSummary.changedLayerIds).toEqual([]);
    expect(result.style.background).toBe("#123456");
    input.patch.operations[0]!.layerId = "roads";
    expect(() => applyOpenStylePatch(input)).toThrow(/Background patch/);
  });

  it("preserves embedded graphics but rejects introducing, duplicating, or replacing image URLs", () => {
    const input = fixture();
    const icon = "data:image/png;base64,AAAA";
    input.style.layers = [{ id: "poi", selector: { sourceLayers: ["poi"] }, style: { name: "poi", geom: "point", symbolizer: { kind: "point", fill: "#fff", size: 12, externalGraphic: icon } } }];
    input.profile.layers = [{ id: "poi", geometry: "point", fields: ["name", "class"] }];
    expect(summarizeOpenStyle(input.style).layers[0]?.style.symbolizer).toMatchObject({ externalGraphic: "embedded-image://preserved" });
    input.patch.operations = [{ op: "replace", layerId: "poi", path: "/symbolizer/size", value: 16 }];
    expect(applyOpenStylePatch(input).style.layers[0]!.style.symbolizer).toMatchObject({ externalGraphic: icon, size: 16 });
    input.patch.operations = [{ op: "replace", layerId: "poi", path: "/symbolizer", value: { kind: "point", fill: "#fff", size: 16, externalGraphic: "https://untrusted.test/icon.png" } }];
    expect(() => applyOpenStylePatch(input)).toThrow(/external image URLs/);
    input.patch.operations = [{ op: "replace", layerId: "poi", path: "/classification", value: { field: "class", classes: [{ label: "all", filter: { op: "eq", value: "a" }, symbolizer: { kind: "point", fill: "#fff", size: 16, externalGraphic: icon } }] } }];
    expect(() => applyOpenStylePatch(input)).toThrow(/external image URLs/);
  });
});
