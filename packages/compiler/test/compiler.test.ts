import { describe, expect, it } from "vitest";
import type { StyleModel } from "@openstyle/schema";
import { compileToSld, formatSld } from "../src/index.js";

describe("compileToSld", () => {
  it("emits a single polygon rule", () => {
    const model: StyleModel = {
      name: "hello",
      title: "Hello",
      geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#334155", stroke: "#0f172a", strokeWidth: 1 },
    };
    // `formatSld` pretty-prints across multiple lines, including newlines
    // between text content and closing tags. Fully collapse whitespace
    // around tag boundaries before matching.
    const flat = compileToSld(model)
      .replace(/>\s+/g, ">")
      .replace(/\s+</g, "<");
    expect(flat).toContain("<PolygonSymbolizer>");
    expect(flat).toContain('<CssParameter name="fill">#334155</CssParameter>');
    expect(flat).toContain("<Name>hello</Name>");
    expect(flat).toContain("<Title>Hello</Title>");
  });

  it("emits classification with else fallback", () => {
    const model: StyleModel = {
      name: "pop",
      geom: "polygon",
      classification: {
        field: "POP",
        classes: [
          { label: "Low", filter: { op: "lt", value: 100 }, symbolizer: { kind: "polygon", fill: "#eee" } },
          { label: "High", filter: { op: "gte", value: 100 }, symbolizer: { kind: "polygon", fill: "#333" } },
        ],
        fallback: { kind: "polygon", fill: "#999" },
      },
    };
    const xml = compileToSld(model);
    expect(xml).toContain("<ogc:PropertyIsLessThan>");
    expect(xml).toContain("<ogc:PropertyIsGreaterThanOrEqualTo>");
    expect(xml).toContain("<ElseFilter/>");
  });

  it("escapes XML entities in field names and values", () => {
    const model: StyleModel = {
      name: "x&y",
      geom: "polygon",
      classification: {
        field: "F&G",
        classes: [
          { label: "a<b", filter: { op: "eq", value: "quote\"here" }, symbolizer: { kind: "polygon", fill: "#000" } },
        ],
      },
    };
    const xml = compileToSld(model);
    expect(xml).not.toMatch(/[^&]&[^amp;#a-z]/); // no bare ampersands
    expect(xml).toContain("x&amp;y");
    expect(xml).toContain("F&amp;G");
    expect(xml).toContain("a&lt;b");
    expect(xml).toContain("quote&quot;here");
  });

  it("emits scale denominators between filter and symbolizer per OGC order", () => {
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
            scale: { minScaleDenominator: 10_000, maxScaleDenominator: 5_000_000 },
          },
        ],
        fallback: { kind: "line", stroke: "#999", strokeWidth: 0.5 },
        fallbackScale: { maxScaleDenominator: 50_000 },
      },
    };
    const xml = compileToSld(model);
    const flat = xml.replace(/>\s+/g, ">").replace(/\s+</g, "<");
    expect(flat).toContain("<MinScaleDenominator>10000</MinScaleDenominator>");
    expect(flat).toContain("<MaxScaleDenominator>5000000</MaxScaleDenominator>");
    // Fallback else-rule scale
    expect(flat).toContain(
      "<ElseFilter/><MaxScaleDenominator>50000</MaxScaleDenominator>",
    );
    // OGC 1.0 order: Filter → Min/Max Scale → Symbolizer
    const filterEnd = flat.indexOf("</ogc:Filter>");
    const minScaleAt = flat.indexOf("<MinScaleDenominator>");
    const symbolizerAt = flat.indexOf("<LineSymbolizer>");
    expect(filterEnd).toBeGreaterThan(-1);
    expect(minScaleAt).toBeGreaterThan(filterEnd);
    expect(symbolizerAt).toBeGreaterThan(minScaleAt);
  });

  it("emits top-level scale on single-symbolizer models", () => {
    const model: StyleModel = {
      name: "detail",
      geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#eee" },
      scale: { maxScaleDenominator: 50_000 },
    };
    const flat = compileToSld(model).replace(/>\s+/g, ">").replace(/\s+</g, "<");
    expect(flat).toContain("<MaxScaleDenominator>50000</MaxScaleDenominator>");
    // No Filter for single-symbolizer, so scale sits right after Title
    expect(flat).toMatch(/<Title>[^<]+<\/Title><MaxScaleDenominator>/);
  });

  it("omits scale block entirely when no scale is set", () => {
    const model: StyleModel = {
      name: "plain",
      geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#eee" },
    };
    const xml = compileToSld(model);
    expect(xml).not.toContain("MinScaleDenominator");
    expect(xml).not.toContain("MaxScaleDenominator");
  });

  it("emits LinePlacement + followLine/repeat VendorOptions for line labels", () => {
    const model: StyleModel = {
      name: "roads_labeled",
      geom: "line",
      symbolizer: { kind: "line", stroke: "#000", strokeWidth: 1 },
      label: {
        field: "name",
        fontSize: 10,
        placement: {
          kind: "line",
          perpendicularOffset: 6,
          followLine: true,
          repeat: 150,
          maxDisplacement: 50,
          maxAngleDelta: 30,
          group: true,
          autoWrap: 80,
        },
      },
    };
    const flat = compileToSld(model).replace(/>\s+/g, ">").replace(/\s+</g, "<");
    // LinePlacement inside LabelPlacement inside TextSymbolizer
    expect(flat).toContain("<LabelPlacement><LinePlacement>");
    expect(flat).toContain("<PerpendicularOffset>6</PerpendicularOffset>");
    // VendorOptions inside TextSymbolizer, after Fill
    expect(flat).toContain('<VendorOption name="followLine">true</VendorOption>');
    expect(flat).toContain('<VendorOption name="repeat">150</VendorOption>');
    expect(flat).toContain('<VendorOption name="maxDisplacement">50</VendorOption>');
    expect(flat).toContain('<VendorOption name="maxAngleDelta">30</VendorOption>');
    expect(flat).toContain('<VendorOption name="group">yes</VendorOption>');
    expect(flat).toContain('<VendorOption name="autoWrap">80</VendorOption>');
  });

  it("emits explicit PointPlacement when anchor/offset is provided", () => {
    const model: StyleModel = {
      name: "labeled",
      geom: "point",
      symbolizer: { kind: "point", fill: "#111", size: 6 },
      label: {
        field: "name",
        placement: { kind: "point", anchorX: 0, anchorY: 0.5, offsetX: 4, rotation: 15 },
      },
    };
    const flat = compileToSld(model).replace(/>\s+/g, ">").replace(/\s+</g, "<");
    expect(flat).toContain("<LabelPlacement><PointPlacement>");
    expect(flat).toContain("<AnchorPointX>0</AnchorPointX>");
    expect(flat).toContain("<AnchorPointY>0.5</AnchorPointY>");
    expect(flat).toContain("<DisplacementX>4</DisplacementX>");
    expect(flat).toContain("<Rotation>15</Rotation>");
  });

  it("omits LabelPlacement when placement is not set (server default)", () => {
    const model: StyleModel = {
      name: "labeled",
      geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#eee" },
      label: { field: "name" },
    };
    const xml = compileToSld(model);
    expect(xml).not.toContain("LabelPlacement");
    expect(xml).not.toContain("VendorOption");
    // But TextSymbolizer is still emitted
    expect(xml).toContain("<TextSymbolizer>");
  });

  it("is deterministic (same input → identical output)", () => {
    const model: StyleModel = {
      name: "d",
      geom: "line",
      symbolizer: { kind: "line", stroke: "#2563eb", strokeWidth: 1.5, dasharray: "6 3" },
    };
    expect(compileToSld(model)).toEqual(compileToSld(model));
  });

  it("snapshot: choropleth polygon", () => {
    const model: StyleModel = {
      name: "population_choropleth",
      title: "Population choropleth",
      geom: "polygon",
      classification: {
        field: "POP_DENS",
        classes: [
          { label: "Low", filter: { op: "lt", value: 100 }, symbolizer: { kind: "polygon", fill: "#f7fbff", stroke: "#c6dbef", strokeWidth: 0.5 } },
          { label: "Mid", filter: { op: "between", value: [100, 1000] }, symbolizer: { kind: "polygon", fill: "#6baed6", stroke: "#3182bd", strokeWidth: 0.5 } },
          { label: "High", filter: { op: "gte", value: 1000 }, symbolizer: { kind: "polygon", fill: "#08306b", stroke: "#08306b", strokeWidth: 0.5 } },
        ],
        fallback: { kind: "polygon", fill: "#9CA3AF" },
      },
      label: { field: "NAME", fontSize: 11, fontColor: "#111827", haloColor: "#ffffff", haloWidth: 1 },
    };
    expect(compileToSld(model)).toMatchSnapshot();
  });
});

describe("formatSld", () => {
  it("indents nested elements", () => {
    const input = "<a><b><c/></b></a>";
    const out = formatSld(input);
    expect(out).toContain("\n");
    expect(out.split("\n").length).toBeGreaterThan(1);
  });
});
