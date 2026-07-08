/**
 * @openstyle/compiler — StyleModel → OGC SLD 1.0.0 XML.
 *
 * The compiler is deterministic: same input → byte-identical output. No LLM
 * ever touches XML; the shape restrictions in @openstyle/schema are what
 * make that safe.
 *
 * Supports point / line / polygon geometries, single-rule styling, and
 * attribute-based classification with optional else-rule fallback. Optional
 * TextSymbolizer overlay via `label`.
 *
 * References:
 * - OGC 02-070 (SLD 1.0.0 Implementation Specification)
 * - GeoServer SLD Cookbook (https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/)
 */
import type {
  AnySymbolizer,
  ClassifyOp,
  LineLabelPlacement,
  LineSymbolizer,
  PointLabelPlacement,
  PointSymbolizer,
  PolygonSymbolizer,
  ScaleRange,
  StyleLabel,
  StyleModel,
  StyleRuleClass,
} from "@openstyle/schema";

// Re-export the schema-side validator for convenience.
export { validateStyleModel } from "@openstyle/schema";

function esc(text: string | number | undefined | null): string {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function literal(v: string | number): string {
  return `<ogc:Literal>${esc(v)}</ogc:Literal>`;
}

function propertyName(field: string): string {
  return `<ogc:PropertyName>${esc(field)}</ogc:PropertyName>`;
}

function buildFilter(
  field: string,
  op: ClassifyOp,
  value: StyleRuleClass["filter"]["value"],
): string {
  switch (op) {
    case "eq":
      return `<ogc:Filter><ogc:PropertyIsEqualTo>${propertyName(field)}${literal(value as string | number)}</ogc:PropertyIsEqualTo></ogc:Filter>`;
    case "neq":
      return `<ogc:Filter><ogc:PropertyIsNotEqualTo>${propertyName(field)}${literal(value as string | number)}</ogc:PropertyIsNotEqualTo></ogc:Filter>`;
    case "gt":
      return `<ogc:Filter><ogc:PropertyIsGreaterThan>${propertyName(field)}${literal(value as string | number)}</ogc:PropertyIsGreaterThan></ogc:Filter>`;
    case "gte":
      return `<ogc:Filter><ogc:PropertyIsGreaterThanOrEqualTo>${propertyName(field)}${literal(value as string | number)}</ogc:PropertyIsGreaterThanOrEqualTo></ogc:Filter>`;
    case "lt":
      return `<ogc:Filter><ogc:PropertyIsLessThan>${propertyName(field)}${literal(value as string | number)}</ogc:PropertyIsLessThan></ogc:Filter>`;
    case "lte":
      return `<ogc:Filter><ogc:PropertyIsLessThanOrEqualTo>${propertyName(field)}${literal(value as string | number)}</ogc:PropertyIsLessThanOrEqualTo></ogc:Filter>`;
    case "between": {
      const arr = Array.isArray(value) ? value : [];
      const lo = arr[0] ?? 0;
      const hi = arr[1] ?? 0;
      return `<ogc:Filter><ogc:PropertyIsBetween>${propertyName(field)}<ogc:LowerBoundary>${literal(lo)}</ogc:LowerBoundary><ogc:UpperBoundary>${literal(hi)}</ogc:UpperBoundary></ogc:PropertyIsBetween></ogc:Filter>`;
    }
    case "in": {
      const arr = Array.isArray(value) ? value : [value as string | number];
      if (arr.length === 0) return "";
      const parts = arr
        .map(
          (v) =>
            `<ogc:PropertyIsEqualTo>${propertyName(field)}${literal(v)}</ogc:PropertyIsEqualTo>`,
        )
        .join("");
      return arr.length === 1
        ? `<ogc:Filter>${parts}</ogc:Filter>`
        : `<ogc:Filter><ogc:Or>${parts}</ogc:Or></ogc:Filter>`;
    }
    case "like":
      return `<ogc:Filter><ogc:PropertyIsLike wildCard="%" singleChar="_" escapeChar="\\">${propertyName(field)}${literal(value as string | number)}</ogc:PropertyIsLike></ogc:Filter>`;
    default:
      return "";
  }
}

function fill(color: string, opacity?: number): string {
  return `<Fill><CssParameter name="fill">${esc(color)}</CssParameter>${
    opacity != null
      ? `<CssParameter name="fill-opacity">${opacity}</CssParameter>`
      : ""
  }</Fill>`;
}

function stroke(
  color: string,
  width?: number,
  opacity?: number,
  dash?: string,
  cap?: string,
  join?: string,
): string {
  return `<Stroke><CssParameter name="stroke">${esc(color)}</CssParameter>${
    width != null
      ? `<CssParameter name="stroke-width">${width}</CssParameter>`
      : ""
  }${
    opacity != null
      ? `<CssParameter name="stroke-opacity">${opacity}</CssParameter>`
      : ""
  }${dash ? `<CssParameter name="stroke-dasharray">${esc(dash)}</CssParameter>` : ""}${
    cap ? `<CssParameter name="stroke-linecap">${esc(cap)}</CssParameter>` : ""
  }${join ? `<CssParameter name="stroke-linejoin">${esc(join)}</CssParameter>` : ""}</Stroke>`;
}

function pointSymbolizerXml(s: PointSymbolizer): string {
  let graphicBody = "";
  if (s.externalGraphic) {
    const fmt = /\.png(\?|$)/i.test(s.externalGraphic)
      ? "image/png"
      : /\.svg(\?|$)/i.test(s.externalGraphic)
        ? "image/svg+xml"
        : /\.jpg|jpeg(\?|$)/i.test(s.externalGraphic)
          ? "image/jpeg"
          : "image/png";
    graphicBody = `<ExternalGraphic><OnlineResource xmlns:xlink="http://www.w3.org/1999/xlink" xlink:type="simple" xlink:href="${esc(s.externalGraphic)}"/><Format>${fmt}</Format></ExternalGraphic>`;
  } else {
    const wkn = s.shape || "circle";
    graphicBody = `<Mark><WellKnownName>${esc(wkn)}</WellKnownName>${fill(s.fill, s.fillOpacity)}${
      s.stroke ? stroke(s.stroke, s.strokeWidth) : ""
    }</Mark>`;
  }
  return `<PointSymbolizer><Graphic>${graphicBody}<Size>${s.size}</Size>${
    s.rotation != null ? `<Rotation>${s.rotation}</Rotation>` : ""
  }</Graphic></PointSymbolizer>`;
}

function lineSymbolizerXml(s: LineSymbolizer): string {
  return `<LineSymbolizer>${stroke(
    s.stroke,
    s.strokeWidth,
    s.strokeOpacity,
    s.dasharray,
    s.linecap,
    s.linejoin,
  )}</LineSymbolizer>`;
}

function polygonSymbolizerXml(s: PolygonSymbolizer): string {
  return `<PolygonSymbolizer>${fill(s.fill, s.fillOpacity)}${
    s.stroke
      ? stroke(s.stroke, s.strokeWidth, s.strokeOpacity, s.strokeDasharray)
      : ""
  }</PolygonSymbolizer>`;
}

function symbolizerXml(s: AnySymbolizer): string {
  switch (s.kind) {
    case "point":
      return pointSymbolizerXml(s);
    case "line":
      return lineSymbolizerXml(s);
    case "polygon":
      return polygonSymbolizerXml(s);
    default:
      return "";
  }
}

/** SLD PointPlacement — anchor + optional offset + optional rotation. */
function pointPlacementXml(p: PointLabelPlacement): string {
  const anchor = `<AnchorPoint><AnchorPointX>${p.anchorX ?? 0.5}</AnchorPointX><AnchorPointY>${p.anchorY ?? 0.5}</AnchorPointY></AnchorPoint>`;
  const offset =
    p.offsetX != null || p.offsetY != null
      ? `<Displacement><DisplacementX>${p.offsetX ?? 0}</DisplacementX><DisplacementY>${p.offsetY ?? 0}</DisplacementY></Displacement>`
      : "";
  const rotation = p.rotation != null ? `<Rotation>${p.rotation}</Rotation>` : "";
  return `<LabelPlacement><PointPlacement>${anchor}${offset}${rotation}</PointPlacement></LabelPlacement>`;
}

/**
 * SLD LinePlacement + the GeoServer VendorOption block that makes a line
 * label actually follow the line. VendorOptions live inside TextSymbolizer,
 * not inside LinePlacement — order matters here.
 */
function linePlacementXml(p: LineLabelPlacement): { placement: string; vendorOptions: string } {
  const perpendicular =
    p.perpendicularOffset != null
      ? `<PerpendicularOffset>${p.perpendicularOffset}</PerpendicularOffset>`
      : "";
  const placement = `<LabelPlacement><LinePlacement>${perpendicular}</LinePlacement></LabelPlacement>`;

  const vo: string[] = [];
  if (p.followLine) vo.push(`<VendorOption name="followLine">true</VendorOption>`);
  if (p.repeat != null) vo.push(`<VendorOption name="repeat">${p.repeat}</VendorOption>`);
  if (p.maxDisplacement != null)
    vo.push(`<VendorOption name="maxDisplacement">${p.maxDisplacement}</VendorOption>`);
  if (p.maxAngleDelta != null)
    vo.push(`<VendorOption name="maxAngleDelta">${p.maxAngleDelta}</VendorOption>`);
  if (p.group) vo.push(`<VendorOption name="group">yes</VendorOption>`);
  if (p.autoWrap != null)
    vo.push(`<VendorOption name="autoWrap">${p.autoWrap}</VendorOption>`);
  if (p.spaceAround != null)
    vo.push(`<VendorOption name="spaceAround">${p.spaceAround}</VendorOption>`);

  return { placement, vendorOptions: vo.join("") };
}

function labelXml(label: StyleLabel): string {
  const font = `<Font>${
    label.fontFamily
      ? `<CssParameter name="font-family">${esc(label.fontFamily)}</CssParameter>`
      : ""
  }${
    label.fontSize != null
      ? `<CssParameter name="font-size">${label.fontSize}</CssParameter>`
      : ""
  }</Font>`;
  const fill = `<Fill>${
    label.fontColor
      ? `<CssParameter name="fill">${esc(label.fontColor)}</CssParameter>`
      : ""
  }</Fill>`;
  const halo = label.haloColor
    ? `<Halo><Radius>${label.haloWidth ?? 1}</Radius><Fill><CssParameter name="fill">${esc(label.haloColor)}</CssParameter></Fill></Halo>`
    : "";

  // Decide placement. Missing placement → GeoServer default (equivalent to
  // an implicit point placement) — we emit nothing rather than a redundant
  // <PointPlacement> block to keep the XML compact.
  let placementXml = "";
  let vendorOptions = "";
  if (label.placement?.kind === "line") {
    const out = linePlacementXml(label.placement);
    placementXml = out.placement;
    vendorOptions = out.vendorOptions;
  } else if (label.placement?.kind === "point") {
    placementXml = pointPlacementXml(label.placement);
  }

  // Ordering per SLD 1.0 § 11.6 (TextSymbolizer):
  //   Geometry?, Label?, Font?, LabelPlacement?, Halo?, Fill?
  // VendorOption is a GeoServer extension appended at the end.
  return `<TextSymbolizer><Label>${propertyName(label.field)}</Label>${font}${placementXml}${halo}${fill}${vendorOptions}</TextSymbolizer>`;
}

/**
 * Emit `<MinScaleDenominator>` / `<MaxScaleDenominator>` XML. OGC SLD 1.0
 * requires this block to sit AFTER Filter/ElseFilter and BEFORE the
 * symbolizers within a Rule. Only emits elements that have values.
 */
function scaleXml(scale: ScaleRange | undefined): string {
  if (!scale) return "";
  let out = "";
  if (scale.minScaleDenominator != null) {
    out += `<MinScaleDenominator>${scale.minScaleDenominator}</MinScaleDenominator>`;
  }
  if (scale.maxScaleDenominator != null) {
    out += `<MaxScaleDenominator>${scale.maxScaleDenominator}</MaxScaleDenominator>`;
  }
  return out;
}

function buildRule(
  name: string,
  title: string,
  filter: string,
  scale: ScaleRange | undefined,
  body: string,
  label: StyleLabel | undefined,
): string {
  return `<Rule><Name>${esc(name)}</Name><Title>${esc(title)}</Title>${filter}${scaleXml(scale)}${body}${
    label ? labelXml(label) : ""
  }</Rule>`;
}

function buildElseRule(
  name: string,
  title: string,
  scale: ScaleRange | undefined,
  body: string,
  label: StyleLabel | undefined,
): string {
  return `<Rule><Name>${esc(name)}</Name><Title>${esc(title)}</Title><ElseFilter/>${scaleXml(scale)}${body}${
    label ? labelXml(label) : ""
  }</Rule>`;
}

/**
 * Compile a StyleModel to OGC SLD 1.0.0 XML.
 *
 * The output is deterministic given the input: no timestamps, no random
 * identifiers, no `Date.now()`. Snapshot testing is safe.
 */
export function compileToSld(model: StyleModel): string {
  const styleName = esc(model.name);
  const styleTitle = esc(model.title || model.name);
  const rules: string[] = [];

  if (model.classification && model.classification.classes.length > 0) {
    const field = model.classification.field;
    model.classification.classes.forEach((c, idx) => {
      const f = buildFilter(field, c.filter.op, c.filter.value);
      rules.push(
        buildRule(
          `rule-${idx}`,
          c.label,
          f,
          c.scale,
          symbolizerXml(c.symbolizer),
          model.label,
        ),
      );
    });
    if (model.classification.fallback) {
      rules.push(
        buildElseRule(
          "rule-else",
          "other",
          model.classification.fallbackScale,
          symbolizerXml(model.classification.fallback),
          model.label,
        ),
      );
    }
  } else if (model.symbolizer) {
    rules.push(
      buildRule(
        "rule-0",
        model.title || model.name,
        "",
        model.scale,
        symbolizerXml(model.symbolizer),
        model.label,
      ),
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0"
    xsi:schemaLocation="http://www.opengis.net/sld StyledLayerDescriptor.xsd"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <NamedLayer>
    <Name>${styleName}</Name>
    <UserStyle>
      <Name>${styleName}</Name>
      <Title>${styleTitle}</Title>
      <FeatureTypeStyle>
        ${rules.join("\n        ")}
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>`;
  return formatSld(xml);
}

/**
 * Pretty-print an SLD/XML string with 2-space indentation. Useful for
 * embedding in editors — the wire form doesn't care about whitespace.
 */
export function formatSld(xml: string): string {
  const tokens = xml
    .replace(/>\s+</g, "><")
    .replace(/\r?\n/g, "")
    .split(/(?=<)/g);
  let indent = 0;
  const lines: string[] = [];
  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    const isClose = /^<\/[^>]+>/.test(t);
    const isSelfClose = /\/>$/.test(t);
    const isDecl = /^<\?xml/.test(t);
    const isComment = /^<!--/.test(t);
    if (isClose) indent = Math.max(0, indent - 1);
    lines.push("  ".repeat(indent) + t);
    if (!isClose && !isSelfClose && !isDecl && !isComment) {
      // only increment when this token contains an unbalanced open tag
      const openCount = (t.match(/<[^/!?][^>]*[^/]>/g) || []).length;
      const closeCount = (t.match(/<\//g) || []).length;
      indent += Math.max(0, openCount - closeCount);
    }
  }
  return lines.join("\n");
}
