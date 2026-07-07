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
