import { describe, expect, it } from "vitest";
import type { OpenStyle } from "@openstyle/schema";
import { buildMapReviewContext } from "../src/review-context.js";

describe("portable visual review context", () => {
  it("preserves design and real fields without passing application history or image bytes", () => {
    const style: OpenStyle & { conversation: string[]; assets: string[] } = {
      schemaVersion: "0.6.0", id: "private-version", name: "private-map-name",
      conversation: ["private conversation"], assets: ["private image bytes"],
      background: "#101820", layers: [{ id: "places", selector: { sourceLayers: ["real-places"] }, zIndex: 7,
        style: { name: "private-style-name", geom: "point", symbolizer: { kind: "point", shape: "circle", fill: "#ffffff", externalGraphic: "data:image/png;base64,privateIconBytes", size: 10 },
          label: { field: "name", fontSize: 12 } } }],
    };
    const sources = [{ id: "real-places", geometry: "point", fields: ["name"], classValues: ["city"], sampleNames: ["private sample"] }];
    const before = JSON.stringify(style);
    const context = buildMapReviewContext({ style, userIntent: "Preserve labels", dataset: { layers: sources }, warnings: ["density warning"] });
    expect(context.map.layers[0]).toMatchObject({ layerId: "places", order: 7, sources: ["real-places"], label: { field: "name" }, symbol: { externalGraphic: "embedded-image://preserved" } });
    expect(context.currentDataset.layers[0]?.fields).toEqual(["name"]);
    expect(context.pixelChecks.warnings).toEqual(["density warning"]);
    expect(JSON.stringify(context)).not.toMatch(/private-version|private-map-name|private conversation|private image bytes|private-style-name|privateIconBytes|private sample/);
    expect(JSON.stringify(style)).toBe(before);
  });
});
