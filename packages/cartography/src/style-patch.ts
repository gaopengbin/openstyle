import { OpenStyleSchema, StyleModelSchema, type OpenStyle, type OpenStyleLayer, type StyleModel } from "@openstyle/schema";
import { z } from "zod";
import { applyLineCasing, LineCasingSchema, type LineCasingOptions } from "./line-casing.js";

export const StylePatchNotesSchema = z.object({
  unsupported: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  missingData: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
}).strict();

export const OpenStylePatchOperationSchema = z.object({
  op: z.enum(["replace", "remove"]),
  layerId: z.string().min(1).max(240).optional(),
  sourceLayer: z.string().min(1).max(160).optional(),
  path: z.string().min(1).max(240),
  value: z.unknown().optional(),
}).strict();
export type OpenStylePatchOperation = z.infer<typeof OpenStylePatchOperationSchema>;

export const OpenStylePatchSchema = z.object({
  baseStyleId: z.string().min(1).max(240),
  sourceId: z.string().min(1),
  operations: z.array(OpenStylePatchOperationSchema).min(1).max(16),
  notes: StylePatchNotesSchema.optional(),
}).strict();
export type OpenStylePatch = z.infer<typeof OpenStylePatchSchema>;

export const OpenStylePatchProfileSchema = z.object({
  sourceId: z.string().min(1),
  layers: z.array(z.object({
    id: z.string().min(1), geometry: z.enum(["point", "line", "polygon", "mixed"]), fields: z.array(z.string()),
  })),
});
export type OpenStylePatchProfile = z.infer<typeof OpenStylePatchProfileSchema>;

export interface OpenStylePatchChangeSummary {
  mode: "patch";
  changedLayerIds: string[];
  changedFields: Array<{ layerId?: string; sourceLayer?: string; path: string }>;
  unsupported: string[];
  missingData: string[];
}
export type MapChangeSummary = OpenStylePatchChangeSummary;

function stable(value: unknown, roundStrokeWidths = false): string | undefined {
  return JSON.stringify(value, (key, entry: unknown) => {
    if (roundStrokeWidths && key === "strokeWidth" && typeof entry === "number") return Math.round(entry * 1e6) / 1e6;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)));
    return entry;
  });
}

type CasingPair = { underlayId: string; casing?: LineCasingOptions };
function casingPairs(style: OpenStyle) {
  const byId = new Map(style.layers.map((layer, index) => [layer.id, { layer, index }]));
  const pairs = new Map<string, CasingPair>();
  const normalizedStyle = (model: StyleModel) => stable(model, true);
  for (const [coreIndex, core] of style.layers.entries()) {
    const found = byId.get(`${core.id}_underlay`);
    const underlay = found?.layer;
    if (!underlay || core.style.geom !== "line" || stable(underlay.selector) !== stable(core.selector)) continue;
    const below = (underlay.zIndex ?? 0) < (core.zIndex ?? 0)
      || (underlay.zIndex ?? 0) === (core.zIndex ?? 0) && found!.index < coreIndex;
    if (!below) continue;
    const symbols = (model: StyleModel) => [model.symbolizer, ...(model.classification?.classes.map((entry) => entry.symbolizer) ?? []), model.classification?.fallback];
    const cores = symbols(core.style);
    const underlays = symbols(underlay.style);
    for (let index = 0; index < cores.length; index++) {
      const inside = cores[index];
      const outside = underlays[index];
      if (inside?.kind !== "line" || outside?.kind !== "line" || outside.strokeWidth <= inside.strokeWidth) continue;
      const candidate = LineCasingSchema.safeParse({ color: outside.stroke, width: (outside.strokeWidth - inside.strokeWidth) / 2 });
      if (candidate.success && normalizedStyle(applyLineCasing(core.style, candidate.data)) === normalizedStyle(underlay.style)) pairs.set(core.id, { underlayId: underlay.id, casing: candidate.data });
      break;
    }
    if (!pairs.has(core.id)) {
      const outside = underlays.find((symbolizer) => symbolizer?.kind === "line");
      const candidate = outside?.kind === "line" ? LineCasingSchema.safeParse({ color: outside.stroke, width: 1 }) : null;
      // Fully hidden cores do not encode an observable extra width. Keep the
      // underlay identity, but never invent a width in the editable summary.
      if (candidate?.success && normalizedStyle(applyLineCasing(core.style, candidate.data)) === normalizedStyle(underlay.style)) pairs.set(core.id, { underlayId: underlay.id });
    }
  }
  for (const pair of pairs.values()) if (pairs.has(pair.underlayId)) throw new Error("Nested casing underlays are ambiguous; use independent canonical line layers.");
  return pairs;
}

/** Compact editable cores; embedded graphics stay in the input, not in model context. */
export function summarizeOpenStyle(style: OpenStyle) {
  OpenStyleSchema.parse(style);
  const paired = casingPairs(style);
  const underlayIds = new Set([...paired.values()].map((pair) => pair.underlayId));
  return {
    styleId: style.id,
    background: style.background,
    layers: style.layers.filter((layer) => !underlayIds.has(layer.id))
      .map((layer, index) => ({ layer, index }))
      .sort((a, b) => (a.layer.zIndex ?? 0) - (b.layer.zIndex ?? 0) || a.index - b.index)
      .map(({ layer }) => ({
        layerId: layer.id, sourceLayers: [...(layer.selector.sourceLayers ?? [])], zIndex: layer.zIndex ?? 0,
        style: JSON.parse(JSON.stringify(layer.style, (key, value) => key === "externalGraphic" && typeof value === "string" && value.startsWith("data:") ? "embedded-image://preserved" : value)) as StyleModel,
        ...(paired.get(layer.id)?.casing ? { casing: paired.get(layer.id)!.casing } : {}),
        ...(paired.get(layer.id) ? { underlayId: paired.get(layer.id)!.underlayId } : {}),
      })),
  };
}

const leaf = "(?:fill|fillOpacity|stroke|strokeOpacity|strokeWidth|strokeDasharray|size|shape|rotation|linecap|linejoin|dasharray)";
const scale = "(?:minScaleDenominator|maxScaleDenominator)";
const placement = "(?:kind|anchorX|anchorY|offsetX|offsetY|rotation|perpendicularOffset|followLine|repeat|spaceAround|maxAngleDelta|maxDisplacement|group|autoWrap)";
const editablePath = new RegExp(`^/(?:symbolizer(?:/${leaf})?|classification(?:/field|/fallback(?:/${leaf})?|/fallbackScale(?:/${scale})?|/classes/[0-9]+(?:/label|/filter(?:/(?:op|value))?|/scale(?:/${scale})?|/symbolizer(?:/${leaf})?)?)?|label(?:/(?:field|fontFamily|fontSize|fontColor|haloColor|haloWidth|minScale|maxScale|placement(?:/${placement})?))?|scale(?:/${scale})?)$`);

function fieldAt(value: unknown, path: string) {
  let target = value;
  for (const segment of path.slice(1).split("/")) {
    if (!target || typeof target !== "object" || !Object.hasOwn(target, segment)) return undefined;
    target = (target as Record<string, unknown>)[segment];
  }
  return target;
}

function changeStyleField(style: StyleModel, operation: OpenStylePatchOperation) {
  if (!editablePath.test(operation.path)) throw new Error(`Unsupported style patch path ${operation.path}.`);
  const segments = operation.path.slice(1).split("/");
  let target = style as unknown as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const next = Object.hasOwn(target, segment) ? target[segment] : undefined;
    if (!next || typeof next !== "object") throw new Error(`Patch parent does not exist: ${operation.path}. Replace its parent object first.`);
    target = next as Record<string, unknown>;
  }
  const key = segments.at(-1)!;
  if (operation.op === "remove") {
    if (!Object.hasOwn(target, key)) throw new Error(`Patch target does not exist: ${operation.path}.`);
    delete target[key];
  } else {
    if (operation.value === undefined) throw new Error(`Patch ${operation.path} requires a value.`);
    target[key] = structuredClone(operation.value);
  }
}

function graphics(model: StyleModel) {
  return [model.symbolizer, ...(model.classification?.classes.map((entry) => entry.symbolizer) ?? []), model.classification?.fallback]
    .flatMap((symbolizer) => symbolizer?.kind === "point" && symbolizer.externalGraphic ? [symbolizer.externalGraphic] : []).sort();
}

/** Atomic, source-bound edits. Rendering, persistence and application metadata belong to callers. */
export function applyOpenStylePatch<T extends OpenStyle>(input: { style: T; profile: OpenStylePatchProfile; patch: OpenStylePatch; resultId: string }): { style: T; changeSummary: OpenStylePatchChangeSummary } {
  const patch = OpenStylePatchSchema.parse(input.patch);
  const profile = OpenStylePatchProfileSchema.parse(input.profile);
  OpenStyleSchema.parse(input.style);
  z.string().min(1).max(240).parse(input.resultId);
  if (patch.baseStyleId !== input.style.id) throw new Error("This patch targets an older style. Read the current style before editing.");
  if (patch.sourceId !== profile.sourceId) throw new Error("Patch data scope does not match the current source.");
  const style = structuredClone(input.style);
  const originalById = new Map(input.style.layers.map((layer) => [layer.id, layer]));
  const editable = new Map(summarizeOpenStyle(input.style).layers.map((layer) => [layer.layerId, layer]));
  const profiles = new Map(profile.layers.map((layer) => [layer.id, layer]));
  const casing = new Map([...editable].map(([id, layer]) => [id, layer.casing]));
  const hasCasing = new Map([...editable].map(([id, layer]) => [id, Boolean(layer.underlayId)]));
  const touched = new Map<string, string>();
  const changedFields: OpenStylePatchChangeSummary["changedFields"] = [];
  const stylePaths = new Map<string, Set<string>>();
  for (const operation of patch.operations) {
    if (operation.path === "/background") {
      if (operation.layerId || operation.sourceLayer || operation.op !== "replace" || !LineCasingSchema.shape.color.safeParse(operation.value).success) throw new Error("Background patch must replace the canvas with a hexadecimal color.");
      if (style.background !== operation.value) { style.background = operation.value as string; changedFields.push({ path: "/background" }); }
      continue;
    }
    const layer = style.layers.find((entry) => entry.id === operation.layerId);
    const sources = [...new Set(layer ? editable.get(layer.id)?.sourceLayers ?? [] : [])];
    const sourceLayer = operation.sourceLayer ?? (sources.length === 1 ? sources[0] : undefined);
    const actual = sourceLayer && sources.length === 1 && sources[0] === sourceLayer ? profiles.get(sourceLayer) : undefined;
    if (!layer || !actual || profile.layers.filter((entry) => entry.id === actual.id).length !== 1 || layer.selector.sourceRef && layer.selector.sourceRef !== profile.sourceId) throw new Error(`Patch target ${operation.layerId ?? "missing"} does not match a unique real source ${operation.sourceLayer ?? "missing"}. Use the exact layerId and its single sourceLayers entry.`);
    const casingField = operation.path === "/casing/width" ? "width" : operation.path === "/casing/color" ? "color" : undefined;
    const changesCasing = operation.path === "/casing" || casingField !== undefined;
    const before = stable(changesCasing ? { options: casing.get(layer.id), present: hasCasing.get(layer.id) } : layer.style);
    if (changesCasing) {
      if (layer.style.geom !== "line") throw new Error("Only a line layer can have casing.");
      const existingUnderlay = style.layers.find((entry) => entry.id === `${layer.id}_underlay`);
      if (existingUnderlay && editable.get(layer.id)?.underlayId !== existingUnderlay.id) throw new Error(`Casing underlay id conflicts with an independent layer: ${existingUnderlay.id}.`);
      if (casingField) {
        if (operation.op === "remove") throw new Error(`Casing ${casingField} is required. Remove /casing to remove the complete stroke.`);
        const existing = casing.get(layer.id);
        if (!existing) throw new Error(`Patch parent does not exist: ${operation.path}. Replace /casing with a complete color and width first.`);
        casing.set(layer.id, LineCasingSchema.parse({ ...existing, [casingField]: operation.value }));
      } else casing.set(layer.id, operation.op === "remove" ? undefined : LineCasingSchema.parse(operation.value));
      hasCasing.set(layer.id, operation.op !== "remove");
    } else {
      changeStyleField(layer.style, operation);
      const paths = stylePaths.get(layer.id) ?? new Set<string>();
      paths.add(operation.path);
      stylePaths.set(layer.id, paths);
    }
    if (before !== stable(changesCasing ? { options: casing.get(layer.id), present: hasCasing.get(layer.id) } : layer.style)) {
      touched.set(layer.id, actual.id);
      changedFields.push({ layerId: layer.id, sourceLayer: actual.id, path: operation.path });
    }
  }
  for (const [id, sourceLayer] of touched) {
    const layer = style.layers.find((entry) => entry.id === id)!;
    const actual = profiles.get(sourceLayer)!;
    const parsed = StyleModelSchema.parse(layer.style);
    if (parsed.geom !== actual.geometry) throw new Error(`Geometry does not match ${sourceLayer}.`);
    if (parsed.classification && !actual.fields.includes(parsed.classification.field)) throw new Error(`Classification field ${parsed.classification.field} is not present in ${sourceLayer}.`);
    if (parsed.label && !actual.fields.includes(parsed.label.field)) throw new Error(`Label field ${parsed.label.field} is not present in ${sourceLayer}.`);
    for (const path of stylePaths.get(id) ?? []) {
      if (stable(fieldAt(layer.style, path)) !== stable(fieldAt(parsed, path))) throw new Error(`Patch ${path} contains fields unsupported by this style geometry.`);
    }
    const beforeGraphics = graphics(originalById.get(id)!.style);
    for (const graphic of graphics(layer.style)) {
      const existing = beforeGraphics.indexOf(graphic);
      if (existing < 0) throw new Error("Patches cannot introduce or replace external image URLs.");
      beforeGraphics.splice(existing, 1);
    }
    const previous = editable.get(id)!;
    const options = casing.get(id);
    const oldUnderlayIndex = previous.underlayId ? style.layers.findIndex((entry) => entry.id === previous.underlayId) : -1;
    if (options) {
      const underlay: OpenStyleLayer = { id: previous.underlayId ?? `${id}_underlay`, selector: structuredClone(layer.selector), zIndex: (layer.zIndex ?? 0) - 1, style: applyLineCasing(layer.style, options) };
      if (oldUnderlayIndex >= 0) style.layers[oldUnderlayIndex] = { ...style.layers[oldUnderlayIndex]!, style: underlay.style };
      else {
        if (style.layers.some((entry) => entry.id === underlay.id)) throw new Error(`Casing underlay id conflicts with an independent layer: ${underlay.id}.`);
        style.layers.splice(style.layers.findIndex((entry) => entry.id === id), 0, underlay);
      }
    } else if (oldUnderlayIndex >= 0 && patch.operations.some((operation) => operation.layerId === id && operation.path === "/casing" && operation.op === "remove")) style.layers.splice(oldUnderlayIndex, 1);
  }
  if (!changedFields.length || stable(style) === stable(input.style)) throw new Error("The patch did not change the style.");
  style.id = input.resultId;
  OpenStyleSchema.parse(style);
  return { style, changeSummary: { mode: "patch", changedLayerIds: [...touched.keys()], changedFields, unsupported: patch.notes?.unsupported ?? [], missingData: patch.notes?.missingData ?? [] } };
}
