import {
  assertOpenStyleCapabilities,
  type AdapterCapabilityManifest,
  type CapabilityNegotiationResult,
} from "@openstyle/adapter";
import {
  validateOpenStyle,
  type AnySymbolizer,
  type ClassifyOp,
  type OpenStyle,
  type OpenStyleLayer,
  type ScaleRange,
  type StyleLabel,
  type StyleModel,
} from "@openstyle/schema";
import type {
  FilterSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";

type Expression = unknown[];

export interface MapLibreCompileOptions {
  sourceId?: string;
  sourceData?: GeoJSONSourceSpecification["data"];
  sourceLayerProperty?: string;
  roleProperty?: string;
  glyphs?: string;
  defaultFontStack?: string[];
  /** Extensions already consumed by a host-side composite adapter. */
  consumedExtensions?: string[];
}

export type MapLibreImageDescriptor =
  | {
      id: string;
      kind: "external";
      url: string;
      size: number;
    }
  | {
      id: string;
      kind: "shape";
      shape: string;
      fill: string;
      fillOpacity: number;
      stroke?: string;
      strokeWidth: number;
      size: number;
    };

export interface MapLibreOpenStyleCompileResult {
  styleId: string;
  style: StyleSpecification;
  images: MapLibreImageDescriptor[];
  negotiation: CapabilityNegotiationResult;
  warnings: string[];
}

export const mapLibreCapabilityManifest: AdapterCapabilityManifest = {
  adapterId: "maplibre",
  target: "maplibre-style-specification",
  capabilities: {
    "map.layer-order": "native",
    "map.background": "native",
    "selector.semantic-role": "native",
    "selector.source-layer": "native",
    "style.point.basic": "native",
    "style.point.external-graphic": "native",
    "style.line.basic": "native",
    "style.line.dash": "native",
    "style.polygon.basic": "native",
    "style.polygon.stroke-dash": "native",
    "style.classification": "native",
    "style.filter.like": "unsupported",
    "style.scale-denominator": "native",
    "style.label.point": "native",
    "style.label.line": "native",
    "style.label.line-follow": "native",
    "style.label.repeat": "native",
    "style.label.max-angle": "native",
    "style.label.space-around": "native",
    "style.label.max-displacement": "unsupported",
    "style.label.group": "emulated",
    "style.label.auto-wrap": "emulated",
  },
};

const DEFAULT_SOURCE_ID = "openstyle-data";
const DEFAULT_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const DEFAULT_FONT_STACK = ["Noto Sans Regular"];
const WORLD_SCALE_DENOMINATOR = 559082264.0287178;
const KNOWN_SHAPES = new Set(["square", "triangle", "star", "cross", "x", "diamond", "shield"]);

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safeId(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || `layer-${stableHash(value)}`;
}

function andFilters(filters: Expression[]) {
  const active = filters.filter(Boolean);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  return ["all", ...active];
}

function selectorFilter(layer: OpenStyleLayer, sourceLayerProperty: string, roleProperty: string) {
  const filters: Expression[] = [];
  if (layer.selector.sourceLayers?.length) {
    filters.push(["in", ["to-string", ["get", sourceLayerProperty]], ["literal", layer.selector.sourceLayers]]);
  }
  if (layer.selector.roles?.length) {
    const role = ["get", roleProperty];
    // MapLibre's typeof can include element type/length, e.g. array<string, 2>.
    filters.push(["case", ["==", ["slice", ["typeof", role], 0, 5], "array"],
      ["any", ...layer.selector.roles.map(expected => ["in", expected, role])],
      ["in", ["to-string", role], ["literal", layer.selector.roles]],
    ]);
  }
  if (layer.selector.geometry) {
    const geometry = layer.selector.geometry === "point" ? "Point" : layer.selector.geometry === "line" ? "LineString" : "Polygon";
    filters.push(["==", ["geometry-type"], geometry]);
  }
  return andFilters(filters);
}

function comparableInput(field: string, expected: string | number | (string | number)[]) {
  const scalar = Array.isArray(expected) ? expected[0] : expected;
  return typeof scalar === "number" ? ["to-number", ["get", field], 0] : ["to-string", ["get", field]];
}

function classificationFilter(field: string, op: ClassifyOp, expected: string | number | (string | number)[]): Expression {
  const input = comparableInput(field, expected);
  const scalar = Array.isArray(expected) ? expected[0] : expected;
  switch (op) {
    case "eq": return ["==", input, scalar];
    case "neq": return ["!=", input, scalar];
    case "gt": return [">", input, scalar];
    case "gte": return [">=", input, scalar];
    case "lt": return ["<", input, scalar];
    case "lte": return ["<=", input, scalar];
    case "between": {
      const range = Array.isArray(expected) ? expected : [expected, expected];
      return ["all", [">=", input, range[0]], ["<=", input, range[1]]];
    }
    case "in": return ["in", input, ["literal", Array.isArray(expected) ? expected : [expected]]];
    case "like": throw new Error("MapLibre does not support OpenStyle `like` filters without semantic loss.");
  }
}

function zoomForScaleDenominator(denominator: number) {
  return Math.max(0, Math.min(24, Math.log2(WORLD_SCALE_DENOMINATOR / denominator)));
}

function scaleLayout(scale?: ScaleRange) {
  const maxDenominator = scale?.maxScaleDenominator;
  const minDenominator = scale?.minScaleDenominator;
  return {
    ...(maxDenominator ? { minzoom: zoomForScaleDenominator(maxDenominator) } : {}),
    ...(minDenominator ? { maxzoom: zoomForScaleDenominator(minDenominator) } : {}),
  };
}

function dashArray(value?: string) {
  if (!value) return undefined;
  const output = value.split(/[ ,]+/).map(Number).filter((entry) => Number.isFinite(entry) && entry >= 0);
  return output.length ? output : undefined;
}

function pointAnchor(label: StyleLabel) {
  if (label.placement?.kind !== "point") return "center";
  const { anchorX = 0.5, anchorY = 0.5 } = label.placement;
  const horizontal = anchorX < 0.34 ? "left" : anchorX > 0.66 ? "right" : "";
  const vertical = anchorY < 0.34 ? "bottom" : anchorY > 0.66 ? "top" : "";
  return `${vertical}-${horizontal}`.replace(/^-|-$/g, "") || "center";
}

function labelLayer(
  id: string,
  sourceId: string,
  filter: Expression | undefined,
  label: StyleLabel,
  scale: ScaleRange | undefined,
  defaultFontStack: string[],
): LayerSpecification | undefined {
  // A label belongs to its rule: a broader label range must never reveal it
  // when the associated symbolizer/class is outside its own scale range.
  const minDenominator = Math.max(scale?.minScaleDenominator ?? 0, label.minScale ?? 0);
  const maxDenominator = Math.min(scale?.maxScaleDenominator ?? Infinity, label.maxScale ?? Infinity);
  if (maxDenominator < minDenominator || maxDenominator <= 0) return undefined;
  const labelScale = {
    minScaleDenominator: minDenominator > 0 ? minDenominator : undefined,
    maxScaleDenominator: Number.isFinite(maxDenominator) ? maxDenominator : undefined,
  };
  const placement = label.placement;
  const fontSize = label.fontSize ?? 11;
  const offset = placement?.kind === "point"
    ? [(placement.offsetX ?? 0) / fontSize, (placement.offsetY ?? 0) / fontSize]
    : [0, 0];
  return {
    id,
    type: "symbol",
    source: sourceId,
    ...(filter ? { filter: filter as FilterSpecification } : {}),
    ...scaleLayout(labelScale),
    layout: {
      "text-field": ["to-string", ["get", label.field]],
      "text-font": label.fontFamily && label.fontFamily !== "sans-serif" ? [label.fontFamily] : defaultFontStack,
      "text-size": fontSize,
      "text-anchor": placement?.kind === "point" ? pointAnchor(label) : "center",
      "text-offset": offset,
      "text-rotate": placement?.kind === "point" ? placement.rotation ?? 0 : 0,
      "symbol-placement": placement?.kind === "line" ? "line" : "point",
      ...(placement?.kind === "line" && placement.repeat ? { "symbol-spacing": placement.repeat } : {}),
      ...(placement?.kind === "line" && placement.maxAngleDelta != null ? { "text-max-angle": placement.maxAngleDelta } : {}),
      ...(placement?.kind === "line" && placement.autoWrap != null ? { "text-max-width": placement.autoWrap / fontSize } : {}),
      ...(placement?.kind === "line" && placement.followLine ? { "text-rotation-alignment": "map" } : {}),
    },
    paint: {
      "text-color": label.fontColor ?? "#111827",
      ...(label.haloColor ? { "text-halo-color": label.haloColor, "text-halo-width": label.haloWidth ?? 1 } : {}),
    },
  } as LayerSpecification;
}

function pointImageDescriptor(symbolizer: Extract<AnySymbolizer, { kind: "point" }>, warnings: string[]): MapLibreImageDescriptor | null {
  if (symbolizer.externalGraphic) {
    return {
      id: `external-${stableHash(symbolizer.externalGraphic)}`,
      kind: "external",
      url: symbolizer.externalGraphic,
      size: symbolizer.size,
    };
  }
  const shape = symbolizer.shape ?? "circle";
  if (shape === "circle") return null;
  const resolvedShape = KNOWN_SHAPES.has(shape) ? shape : "square";
  if (resolvedShape !== shape) warnings.push(`point shape ${shape} is unavailable in MapLibre; using an explicit square sprite`);
  const signature = JSON.stringify({ shape: resolvedShape, fill: symbolizer.fill, fillOpacity: symbolizer.fillOpacity, stroke: symbolizer.stroke, strokeWidth: symbolizer.strokeWidth, size: symbolizer.size });
  return {
    id: `shape-${stableHash(signature)}`,
    kind: "shape",
    shape: resolvedShape,
    fill: symbolizer.fill,
    fillOpacity: symbolizer.fillOpacity ?? 1,
    stroke: symbolizer.stroke,
    strokeWidth: symbolizer.strokeWidth ?? 0,
    size: symbolizer.size,
  };
}

function compileSymbolizer(
  id: string,
  sourceId: string,
  filter: Expression | undefined,
  symbolizer: AnySymbolizer,
  scale: ScaleRange | undefined,
  images: MapLibreImageDescriptor[],
  warnings: string[],
) {
  const shared = {
    id,
    source: sourceId,
    ...(filter ? { filter: filter as FilterSpecification } : {}),
    ...scaleLayout(scale),
  };
  if (symbolizer.kind === "line") {
    return [{
      ...shared,
      type: "line",
      layout: {
        ...(symbolizer.linecap ? { "line-cap": symbolizer.linecap } : {}),
        ...(symbolizer.linejoin ? { "line-join": symbolizer.linejoin } : {}),
      },
      paint: {
        "line-color": symbolizer.stroke,
        "line-width": symbolizer.strokeWidth,
        "line-opacity": symbolizer.strokeOpacity ?? 1,
        ...(dashArray(symbolizer.dasharray) ? { "line-dasharray": dashArray(symbolizer.dasharray) } : {}),
      },
    } as LayerSpecification];
  }
  if (symbolizer.kind === "polygon") {
    const output: LayerSpecification[] = [{
      ...shared,
      id: `${id}-fill`,
      type: "fill",
      paint: {
        "fill-color": symbolizer.fill,
        "fill-opacity": symbolizer.fillOpacity ?? 1,
      },
    } as LayerSpecification];
    if (symbolizer.stroke && (symbolizer.strokeWidth ?? 1) > 0) {
      output.push({
        ...shared,
        id: `${id}-stroke`,
        type: "line",
        paint: {
          "line-color": symbolizer.stroke,
          "line-width": symbolizer.strokeWidth ?? 1,
          "line-opacity": symbolizer.strokeOpacity ?? 1,
          ...(dashArray(symbolizer.strokeDasharray) ? { "line-dasharray": dashArray(symbolizer.strokeDasharray) } : {}),
        },
      } as LayerSpecification);
    }
    return output;
  }

  const image = pointImageDescriptor(symbolizer, warnings);
  if (image) {
    if (!images.some((entry) => entry.id === image.id)) images.push(image);
    return [{
      ...shared,
      type: "symbol",
      layout: {
        "icon-image": image.id,
        "icon-size": 1,
        "icon-rotate": symbolizer.rotation ?? 0,
        "icon-allow-overlap": false,
      },
      paint: { "icon-opacity": symbolizer.fillOpacity ?? 1 },
    } as LayerSpecification];
  }
  return [{
    ...shared,
    type: "circle",
    paint: {
      "circle-radius": symbolizer.size / 2,
      "circle-color": symbolizer.fill,
      "circle-opacity": symbolizer.fillOpacity ?? 1,
      "circle-stroke-color": symbolizer.stroke ?? "rgba(0,0,0,0)",
      "circle-stroke-width": symbolizer.strokeWidth ?? 0,
    },
  } as LayerSpecification];
}

function compileModel(
  layer: OpenStyleLayer,
  sourceId: string,
  selector: Expression | undefined,
  images: MapLibreImageDescriptor[],
  warnings: string[],
  defaultFontStack: string[],
) {
  const output: LayerSpecification[] = [];
  const model: StyleModel = layer.style;
  const append = (suffix: string, symbolizer: AnySymbolizer, filter: Expression | undefined, scale?: ScaleRange) => {
    const baseId = `${safeId(layer.id)}-${suffix}`;
    output.push(...compileSymbolizer(baseId, sourceId, filter, symbolizer, scale, images, warnings));
    if (model.label) {
      const text = labelLayer(`${baseId}-label`, sourceId, filter, model.label, scale, defaultFontStack);
      if (text) output.push(text);
    }
  };

  if (model.symbolizer) {
    append("rule", model.symbolizer, selector, model.scale);
    return output;
  }
  const classification = model.classification;
  if (!classification) return output;
  const classFilters = classification.classes.map((entry) => classificationFilter(classification.field, entry.filter.op, entry.filter.value));
  classification.classes.forEach((entry, index) => {
    append(`class-${index}`, entry.symbolizer, andFilters([...(selector ? [selector] : []), classFilters[index]!]), entry.scale);
  });
  if (classification.fallback) {
    const unmatched: Expression = ["!", classFilters.length === 1 ? classFilters[0]! : ["any", ...classFilters]];
    append("fallback", classification.fallback, andFilters([...(selector ? [selector] : []), unmatched]), classification.fallbackScale);
  }
  return output;
}

function removeConsumedExtensions(style: OpenStyle, consumed: Set<string>): OpenStyle {
  const strip = (extensions: OpenStyle["extensions"]) => {
    const entries = Object.entries(extensions ?? {}).filter(([key]) => !consumed.has(key));
    return entries.length ? Object.fromEntries(entries) : undefined;
  };
  return {
    ...style,
    extensions: strip(style.extensions),
    layers: style.layers.map((layer) => ({
      ...layer,
      extensions: strip(layer.extensions),
      style: { ...layer.style, extensions: strip(layer.style.extensions) },
    })),
  };
}

/** Compile a canonical whole-map OpenStyle into a deterministic MapLibre style. */
export function compileOpenStyleToMapLibre(style: OpenStyle, options: MapLibreCompileOptions = {}): MapLibreOpenStyleCompileResult {
  const validation = validateOpenStyle(style);
  if (!validation.ok) throw new Error(`Invalid OpenStyle: ${validation.errors.join("; ")}`);
  const compilerInput = removeConsumedExtensions(style, new Set(options.consumedExtensions ?? []));
  const negotiation = assertOpenStyleCapabilities(compilerInput, mapLibreCapabilityManifest);
  const sourceId = options.sourceId ?? DEFAULT_SOURCE_ID;
  const images: MapLibreImageDescriptor[] = [];
  const warnings = [...validation.warnings, ...negotiation.warnings];
  const layers = [...compilerInput.layers]
    .sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0))
    .flatMap((layer) => compileModel(
      layer,
      sourceId,
      selectorFilter(layer, options.sourceLayerProperty ?? "layer", options.roleProperty ?? "role"),
      images,
      warnings,
      options.defaultFontStack ?? DEFAULT_FONT_STACK,
    ));
  const sourceData = options.sourceData ?? { type: "FeatureCollection", features: [] };
  return {
    styleId: compilerInput.id,
    style: {
      version: 8,
      name: compilerInput.name,
      glyphs: options.glyphs ?? DEFAULT_GLYPHS,
      sources: {
        [sourceId]: { type: "geojson", data: sourceData },
      },
      layers: [
        ...(compilerInput.background ? [{ id: "openstyle-background", type: "background" as const, paint: { "background-color": compilerInput.background } }] : []),
        ...layers,
      ],
    },
    images,
    negotiation,
    warnings,
  };
}
