import { describe, expect, it } from "vitest";
import type { StyleModel } from "@openstyle/schema";
import {
  buildSystemPrompt,
  describeLayer,
  extractJson,
  inferStyleModelGeom,
  summarizeSldDiff,
  validateModelFieldRefs,
  validateSldPreflight,
  type LayerContext,
} from "../src/index.js";

const LAYER: LayerContext = {
  workspace: "topp",
  name: "states",
  geom: "MultiPolygon",
  crs: "EPSG:4326",
  fields: [
    { name: "STATE_NAME", type: "string" },
    { name: "POP2000", type: "int" },
  ],
};

describe("buildSystemPrompt", () => {
  it("mentions the JSON shape and no-markdown rule", () => {
    const p = buildSystemPrompt();
    expect(p).toContain('"classification"');
    expect(p).toContain("Do not include markdown");
  });

  it("teaches zoom-dependent styling via minScale/maxScale", () => {
    const p = buildSystemPrompt();
    expect(p).toContain("minScaleDenominator");
    expect(p).toContain("maxScaleDenominator");
    // The prompt should gate scale usage — only when user asks for it
    expect(p).toContain("zoom-dependent");
  });

  it("forbids duplicate filters without scale (unreachable rule guard)", () => {
    const p = buildSystemPrompt();
    // Signals the model that identical filters must be zoom-partitioned
    expect(p).toMatch(/no scale, no duplicate filter/i);
    expect(p).toContain("unreachable");
  });

  it("mandates line-following placement for labels on line geometries", () => {
    const p = buildSystemPrompt();
    expect(p).toMatch(/labels on lines must follow the line/i);
    expect(p).toContain('kind: "line"');
    expect(p).toContain("followLine");
  });

  it("forbids skipping label when the user asks for labels", () => {
    const p = buildSystemPrompt();
    expect(p).toMatch(/if the user asks for labels, you must emit/i);
    // Push back on the model's tendency to invent schema limitations
    expect(p).toContain("hallucinate limitations");
  });
});

describe("inferStyleModelGeom", () => {
  it.each([
    ["Point", "point"],
    ["MultiPoint", "point"],
    ["LineString", "line"],
    ["MultiLineString", "line"],
    ["Polygon", "polygon"],
    ["MultiPolygon", "polygon"],
    ["Curve", "line"],
    ["", "polygon"],
  ])("maps %s to %s", (input, expected) => {
    expect(inferStyleModelGeom(input)).toBe(expected);
  });
});

describe("describeLayer", () => {
  it("includes fields and samples", () => {
    const out = describeLayer(LAYER, [{ STATE_NAME: "CA", POP2000: 34_000_000 }]);
    expect(out).toContain("topp:states");
    expect(out).toContain("STATE_NAME: string");
    expect(out).toContain("34000000");
  });
});

describe("extractJson", () => {
  it("parses a strict JSON string", () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("unwraps a fenced block", () => {
    const text = "here you go:\n```json\n{\"a\":2}\n```\n";
    expect(extractJson<{ a: number }>(text)).toEqual({ a: 2 });
  });

  it("falls back to first {...} substring", () => {
    const text = "sure. {\"a\":3} that's the answer.";
    expect(extractJson<{ a: number }>(text)).toEqual({ a: 3 });
  });

  it("throws on unparseable input", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("validateModelFieldRefs", () => {
  const goodModel: StyleModel = {
    name: "x",
    geom: "polygon",
    classification: {
      field: "STATE_NAME",
      classes: [
        { label: "a", filter: { op: "eq", value: "CA" }, symbolizer: { kind: "polygon", fill: "#111" } },
      ],
    },
  };

  it("returns [] when all fields exist", () => {
    expect(validateModelFieldRefs(goodModel, LAYER)).toEqual([]);
  });

  it("flags missing fields as block", () => {
    const bad: StyleModel = { ...goodModel, classification: { ...goodModel.classification!, field: "NOT_A_FIELD" } };
    const issues = validateModelFieldRefs(bad, LAYER);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("block");
  });

  it("also checks label.field", () => {
    const withBadLabel: StyleModel = {
      name: "x",
      geom: "polygon",
      symbolizer: { kind: "polygon", fill: "#111" },
      label: { field: "MISSING", fontSize: 12 },
    };
    expect(validateModelFieldRefs(withBadLabel, LAYER)).toHaveLength(1);
  });
});

describe("validateSldPreflight", () => {
  it("returns ok when the SLD is well-formed", () => {
    const sld = `<StyledLayerDescriptor><NamedLayer><Rule><PolygonSymbolizer/></Rule></NamedLayer></StyledLayerDescriptor>`;
    const issues = validateSldPreflight(sld);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("ok");
  });

  it("flags missing root", () => {
    const sld = `<NamedLayer><Rule><PolygonSymbolizer/></Rule></NamedLayer>`;
    const issues = validateSldPreflight(sld);
    expect(issues.some((i) => i.id === "sld-root-missing")).toBe(true);
  });

  it("flags placeholder leak", () => {
    const sld = `<StyledLayerDescriptor><NamedLayer><Rule><PolygonSymbolizer><CssParameter>ascii_style_name</CssParameter></PolygonSymbolizer></Rule></NamedLayer></StyledLayerDescriptor>`;
    const issues = validateSldPreflight(sld);
    expect(issues.some((i) => i.id === "sld-placeholder-text")).toBe(true);
  });

  it("flags duplicate rule filters without scale (unreachable rules)", () => {
    // Same filter across two rules, neither has scale — only the first fires.
    const sld = `<StyledLayerDescriptor><NamedLayer>
      <Rule>
        <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>cat</ogc:PropertyName><ogc:Literal>1</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
        <LineSymbolizer><Stroke><CssParameter name="stroke-width">1</CssParameter></Stroke></LineSymbolizer>
      </Rule>
      <Rule>
        <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>cat</ogc:PropertyName><ogc:Literal>1</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
        <LineSymbolizer><Stroke><CssParameter name="stroke-width">3</CssParameter></Stroke></LineSymbolizer>
      </Rule>
    </NamedLayer></StyledLayerDescriptor>`;
    const issues = validateSldPreflight(sld);
    expect(issues.some((i) => i.id === "sld-duplicate-filter-no-scale")).toBe(
      true,
    );
  });

  it("accepts duplicate filters when every rule has a partitioning scale", () => {
    const sld = `<StyledLayerDescriptor><NamedLayer>
      <Rule>
        <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>cat</ogc:PropertyName><ogc:Literal>1</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
        <MaxScaleDenominator>50000</MaxScaleDenominator>
        <LineSymbolizer><Stroke><CssParameter name="stroke-width">3</CssParameter></Stroke></LineSymbolizer>
      </Rule>
      <Rule>
        <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>cat</ogc:PropertyName><ogc:Literal>1</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
        <MinScaleDenominator>50000</MinScaleDenominator>
        <LineSymbolizer><Stroke><CssParameter name="stroke-width">1</CssParameter></Stroke></LineSymbolizer>
      </Rule>
    </NamedLayer></StyledLayerDescriptor>`;
    const issues = validateSldPreflight(sld);
    expect(issues.some((i) => i.id === "sld-duplicate-filter-no-scale")).toBe(
      false,
    );
  });

  it("does not flag ElseFilter as a duplication problem", () => {
    const sld = `<StyledLayerDescriptor><NamedLayer>
      <Rule><ogc:ElseFilter/><LineSymbolizer/></Rule>
      <Rule><ogc:ElseFilter/><LineSymbolizer/></Rule>
    </NamedLayer></StyledLayerDescriptor>`;
    const issues = validateSldPreflight(sld);
    expect(issues.some((i) => i.id === "sld-duplicate-filter-no-scale")).toBe(
      false,
    );
  });

  it("flags line label without LinePlacement (centroid label mistake)", () => {
    const sld = `<StyledLayerDescriptor><NamedLayer><Rule>
      <LineSymbolizer><Stroke/></LineSymbolizer>
      <TextSymbolizer><Label><ogc:PropertyName>name</ogc:PropertyName></Label></TextSymbolizer>
    </Rule></NamedLayer></StyledLayerDescriptor>`;
    const issues = validateSldPreflight(sld);
    expect(
      issues.some((i) => i.id === "sld-line-label-not-along-line"),
    ).toBe(true);
  });

  it("accepts line label with LinePlacement", () => {
    const sld = `<StyledLayerDescriptor><NamedLayer><Rule>
      <LineSymbolizer><Stroke/></LineSymbolizer>
      <TextSymbolizer>
        <Label><ogc:PropertyName>name</ogc:PropertyName></Label>
        <LabelPlacement><LinePlacement><PerpendicularOffset>6</PerpendicularOffset></LinePlacement></LabelPlacement>
        <VendorOption name="followLine">true</VendorOption>
      </TextSymbolizer>
    </Rule></NamedLayer></StyledLayerDescriptor>`;
    const issues = validateSldPreflight(sld);
    expect(
      issues.some((i) => i.id === "sld-line-label-not-along-line"),
    ).toBe(false);
  });
});

describe("summarizeSldDiff", () => {
  it("handles first-version case", () => {
    const r = summarizeSldDiff("", "<a>x</a>\n<b>y</b>");
    expect(r.removed).toEqual([]);
    expect(r.added.length).toBeGreaterThan(0);
  });

  it("returns line diff between two SLDs", () => {
    const a = "<a>1</a>\n<b>2</b>";
    const b = "<a>1</a>\n<c>3</c>";
    const r = summarizeSldDiff(a, b);
    expect(r.added).toEqual(["<c>3</c>"]);
    expect(r.removed).toEqual(["<b>2</b>"]);
  });
});
