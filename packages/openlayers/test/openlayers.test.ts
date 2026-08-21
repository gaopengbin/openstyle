import { describe, expect, it } from "vitest";
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import Polygon from "ol/geom/Polygon.js";
import type { StyleModel } from "@openstyle/schema";
import { compileToOpenLayersStyle } from "../src/index.js";

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
