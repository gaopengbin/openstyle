import type {
  AnySymbolizer,
  ClassifyOp,
  ScaleRange,
  StyleLabel,
  StyleModel,
} from "@openstyle/schema";
import { validateStyleModel } from "@openstyle/schema";
import type { FeatureLike } from "ol/Feature.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Icon from "ol/style/Icon.js";
import RegularShape from "ol/style/RegularShape.js";
import Stroke from "ol/style/Stroke.js";
import Style, { type StyleFunction } from "ol/style/Style.js";
import Text from "ol/style/Text.js";

export interface OpenLayersCompileOptions {
  /** OGC standard pixel size in metres. */
  pixelSizeMetres?: number;
  /** Projection metres per map unit. EPSG:3857 is 1. */
  metresPerUnit?: number;
}

export interface OpenLayersCompileResult {
  styleFunction: StyleFunction;
  warnings: string[];
}

function dashArray(value?: string) {
  if (!value) return undefined;
  const parsed = value.split(/[ ,]+/).map(Number).filter((entry) => Number.isFinite(entry) && entry >= 0);
  return parsed.length > 0 ? parsed : undefined;
}

function createImage(symbolizer: Extract<AnySymbolizer, { kind: "point" }>) {
  if (symbolizer.externalGraphic) {
    return new Icon({
      src: symbolizer.externalGraphic,
      width: symbolizer.size,
      height: symbolizer.size,
      rotation: ((symbolizer.rotation ?? 0) * Math.PI) / 180,
    });
  }

  const fill = new Fill({ color: symbolizer.fill });
  const stroke = symbolizer.stroke
    ? new Stroke({ color: symbolizer.stroke, width: symbolizer.strokeWidth ?? 1 })
    : undefined;
  const rotation = ((symbolizer.rotation ?? 0) * Math.PI) / 180;
  const shape = symbolizer.shape ?? "circle";
  if (shape === "circle") {
    return new CircleStyle({ radius: symbolizer.size / 2, fill, stroke, rotation });
  }
  const points = shape === "triangle" ? 3 : shape === "square" ? 4 : shape === "star" ? 5 : 4;
  return new RegularShape({
    points,
    radius: symbolizer.size / 2,
    radius2: shape === "star" ? symbolizer.size / 4 : undefined,
    angle: shape === "square" ? Math.PI / 4 : 0,
    fill,
    stroke,
    rotation,
  });
}

function createText(label: StyleLabel, feature: FeatureLike) {
  const value = feature.get(label.field);
  if (value == null || value === "") return undefined;
  const placement = label.placement;
  return new Text({
    text: String(value),
    font: `${label.fontSize ?? 11}px ${label.fontFamily ?? 'Inter, "Segoe UI", sans-serif'}`,
    fill: new Fill({ color: label.fontColor ?? "#111827" }),
    stroke: label.haloColor
      ? new Stroke({ color: label.haloColor, width: label.haloWidth ?? 1 })
      : undefined,
    placement: placement?.kind === "line" ? "line" : "point",
    repeat: placement?.kind === "line" ? placement.repeat : undefined,
    maxAngle: placement?.kind === "line" && placement.maxAngleDelta != null
      ? (placement.maxAngleDelta * Math.PI) / 180
      : undefined,
    offsetX: placement?.kind === "point" ? placement.offsetX ?? 0 : 0,
    offsetY: placement?.kind === "point" ? placement.offsetY ?? 0 : 0,
    rotation: placement?.kind === "point" ? ((placement.rotation ?? 0) * Math.PI) / 180 : 0,
    overflow: false,
  });
}

function createStyle(symbolizer: AnySymbolizer, label: StyleLabel | undefined, feature: FeatureLike) {
  const text = label ? createText(label, feature) : undefined;
  if (symbolizer.kind === "point") {
    return new Style({ image: createImage(symbolizer), text });
  }
  if (symbolizer.kind === "line") {
    return new Style({
      stroke: new Stroke({
        color: symbolizer.stroke,
        width: symbolizer.strokeWidth,
        lineDash: dashArray(symbolizer.dasharray),
        lineCap: symbolizer.linecap,
        lineJoin: symbolizer.linejoin,
      }),
      text,
    });
  }
  return new Style({
    fill: new Fill({ color: symbolizer.fill }),
    stroke: symbolizer.stroke
      ? new Stroke({
          color: symbolizer.stroke,
          width: symbolizer.strokeWidth ?? 1,
          lineDash: dashArray(symbolizer.strokeDasharray),
        })
      : undefined,
    text,
  });
}

function matches(op: ClassifyOp, actual: unknown, expected: string | number | (string | number)[]) {
  const comparable = typeof actual === "number" ? actual : String(actual ?? "");
  const scalar = Array.isArray(expected) ? expected[0] : expected;
  switch (op) {
    case "eq": return comparable === scalar;
    case "neq": return comparable !== scalar;
    case "gt": return Number(comparable) > Number(scalar);
    case "gte": return Number(comparable) >= Number(scalar);
    case "lt": return Number(comparable) < Number(scalar);
    case "lte": return Number(comparable) <= Number(scalar);
    case "between": return Array.isArray(expected) && Number(comparable) >= Number(expected[0]) && Number(comparable) <= Number(expected[1]);
    case "in": return Array.isArray(expected) && expected.includes(comparable as string | number);
    case "like": {
      const pattern = String(scalar).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
      return new RegExp(`^${pattern}$`, "i").test(String(comparable));
    }
  }
}

function inScale(scale: ScaleRange | undefined, resolution: number, options: Required<OpenLayersCompileOptions>) {
  if (!scale) return true;
  const denominator = (resolution * options.metresPerUnit) / options.pixelSizeMetres;
  if (scale.minScaleDenominator != null && denominator < scale.minScaleDenominator) return false;
  if (scale.maxScaleDenominator != null && denominator > scale.maxScaleDenominator) return false;
  return true;
}

export function compileToOpenLayers(model: StyleModel, options: OpenLayersCompileOptions = {}): OpenLayersCompileResult {
  const validation = validateStyleModel(model);
  if (!validation.ok) throw new Error(`Invalid StyleModel: ${validation.errors.join("; ")}`);
  const resolvedOptions = {
    pixelSizeMetres: options.pixelSizeMetres ?? 0.00028,
    metresPerUnit: options.metresPerUnit ?? 1,
  };

  const styleFunction: StyleFunction = (feature, resolution) => {
    if (model.symbolizer) {
      if (!inScale(model.scale, resolution, resolvedOptions)) return undefined;
      return createStyle(model.symbolizer, model.label, feature);
    }

    const classification = model.classification;
    if (!classification) return undefined;
    const actual = feature.get(classification.field);
    for (const entry of classification.classes) {
      if (matches(entry.filter.op, actual, entry.filter.value) && inScale(entry.scale, resolution, resolvedOptions)) {
        return createStyle(entry.symbolizer, model.label, feature);
      }
    }
    if (classification.fallback && inScale(classification.fallbackScale, resolution, resolvedOptions)) {
      return createStyle(classification.fallback, model.label, feature);
    }
    return undefined;
  };

  return { styleFunction, warnings: validation.warnings };
}

export function compileToOpenLayersStyle(model: StyleModel, options?: OpenLayersCompileOptions) {
  return compileToOpenLayers(model, options).styleFunction;
}

export { validateStyleModel } from "@openstyle/schema";
