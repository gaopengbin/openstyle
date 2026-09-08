import type { AnySymbolizer, OpenStyle, StyleModel } from "@openstyle/schema";
import { z } from "zod";

export const CapabilitySupportSchema = z.enum(["native", "emulated", "unsupported"]);
export type CapabilitySupport = z.infer<typeof CapabilitySupportSchema>;

export const AdapterCapabilityManifestSchema = z.object({
  adapterId: z.string().min(1),
  target: z.string().min(1),
  capabilities: z.record(z.string(), CapabilitySupportSchema),
});
export type AdapterCapabilityManifest = z.infer<typeof AdapterCapabilityManifestSchema>;

export interface CapabilityNegotiationResult {
  adapterId: string;
  target: string;
  required: string[];
  native: string[];
  emulated: string[];
  unsupported: string[];
  ok: boolean;
  warnings: string[];
}

function symbolizers(model: StyleModel): AnySymbolizer[] {
  return [
    ...(model.symbolizer ? [model.symbolizer] : []),
    ...(model.classification?.classes.map((entry) => entry.symbolizer) ?? []),
    ...(model.classification?.fallback ? [model.classification.fallback] : []),
  ];
}

function hasScale(model: StyleModel) {
  return Boolean(model.scale || model.classification?.fallbackScale || model.classification?.classes.some((entry) => entry.scale));
}

function addExtensionCapabilities(target: Set<string>, extensions: Record<string, Record<string, unknown>> | undefined) {
  for (const adapterId of Object.keys(extensions ?? {})) target.add(`extension:${adapterId}`);
}

export function collectRequiredCapabilities(style: OpenStyle) {
  const required = new Set<string>(["map.layer-order"]);
  if (style.background) required.add("map.background");
  addExtensionCapabilities(required, style.extensions);

  for (const layer of style.layers) {
    if (layer.selector.roles?.length) required.add("selector.semantic-role");
    if (layer.selector.sourceLayers?.length) required.add("selector.source-layer");
    addExtensionCapabilities(required, layer.extensions);
    addExtensionCapabilities(required, layer.style.extensions);
    const model = layer.style;
    if (model.classification) required.add("style.classification");
    if (model.classification?.classes.some((entry) => entry.filter.op === "like")) required.add("style.filter.like");
    if (hasScale(model)) required.add("style.scale-denominator");
    for (const symbolizer of symbolizers(model)) {
      required.add(`style.${symbolizer.kind}.basic`);
      if (symbolizer.kind === "point" && symbolizer.externalGraphic) required.add("style.point.external-graphic");
      if (symbolizer.kind === "line" && symbolizer.dasharray) required.add("style.line.dash");
      if (symbolizer.kind === "polygon" && symbolizer.strokeDasharray) required.add("style.polygon.stroke-dash");
    }
    const placement = model.label?.placement;
    if (model.label) required.add(placement?.kind === "line" ? "style.label.line" : "style.label.point");
    if (placement?.kind === "line") {
      if (placement.followLine) required.add("style.label.line-follow");
      if (placement.repeat != null) required.add("style.label.repeat");
      if (placement.maxDisplacement != null) required.add("style.label.max-displacement");
      if (placement.maxAngleDelta != null) required.add("style.label.max-angle");
      if (placement.group) required.add("style.label.group");
      if (placement.autoWrap != null) required.add("style.label.auto-wrap");
      if (placement.spaceAround != null) required.add("style.label.space-around");
    }
  }
  return [...required].sort();
}

export function negotiateOpenStyleCapabilities(style: OpenStyle, rawManifest: AdapterCapabilityManifest): CapabilityNegotiationResult {
  const manifest = AdapterCapabilityManifestSchema.parse(rawManifest);
  const required = collectRequiredCapabilities(style);
  const native: string[] = [];
  const emulated: string[] = [];
  const unsupported: string[] = [];
  for (const capability of required) {
    const support = manifest.capabilities[capability] ?? "unsupported";
    if (support === "native") native.push(capability);
    else if (support === "emulated") emulated.push(capability);
    else unsupported.push(capability);
  }
  return {
    adapterId: manifest.adapterId,
    target: manifest.target,
    required,
    native,
    emulated,
    unsupported,
    ok: unsupported.length === 0,
    warnings: emulated.map((capability) => `${manifest.adapterId} emulates ${capability}; inspect rendered evidence before publishing`),
  };
}

export class OpenStyleCapabilityError extends Error {
  readonly negotiation: CapabilityNegotiationResult;
  constructor(negotiation: CapabilityNegotiationResult) {
    super(`${negotiation.adapterId} cannot render required OpenStyle capabilities: ${negotiation.unsupported.join(", ")}`);
    this.name = "OpenStyleCapabilityError";
    this.negotiation = negotiation;
  }
}

export function assertOpenStyleCapabilities(style: OpenStyle, manifest: AdapterCapabilityManifest) {
  const negotiation = negotiateOpenStyleCapabilities(style, manifest);
  if (!negotiation.ok) throw new OpenStyleCapabilityError(negotiation);
  return negotiation;
}
