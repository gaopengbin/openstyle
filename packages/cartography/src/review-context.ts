import type { OpenStyle } from "@openstyle/schema";
import type { StyleProfile } from "./index.js";
import { summarizeOpenStyle } from "./style-patch.js";
import type { RenderPixelMetrics } from "./render-quality.js";

/** Only the data descriptors that a visual reviewer needs. No feature samples. */
export interface ReviewSourceLayer {
  id: string;
  geometry: string;
  fields: readonly string[];
  classValues?: readonly string[];
}

export interface MapReviewContextInput {
  style: OpenStyle;
  userIntent: string;
  locale?: string;
  styleProfile?: StyleProfile;
  dataset: { location?: string; layers: readonly ReviewSourceLayer[] };
  changes?: {
    mode: "full" | "patch";
    changedLayerIds: readonly string[];
    unsupported: readonly string[];
    missingData: readonly string[];
  };
  pixelMetrics?: RenderPixelMetrics;
  warnings?: readonly string[];
  repairAttempts?: number;
}

/**
 * Build bounded design context for any visual reviewer. Screenshots travel
 * separately; this whitelist excludes project history, keys, source payloads,
 * internal style names, and embedded asset bytes. It makes no model request.
 */
export function buildMapReviewContext(input: MapReviewContextInput) {
  const map = summarizeOpenStyle(input.style);
  const profile = input.styleProfile;
  return {
    locale: input.locale,
    userIntent: input.userIntent,
    visualRules: profile ? {
      family: profile.visualLanguage.family,
      summary: profile.visualLanguage.summary,
      palette: profile.palette.map(({ role, color }) => ({ role, color })),
      hierarchy: profile.hierarchy.map(({ role, priority, treatment }) => ({ role, priority, treatment })),
      typography: profile.typography,
      geometry: profile.geometry,
    } : undefined,
    currentDataset: {
      location: input.dataset.location,
      layers: input.dataset.layers.map(({ id, geometry, fields, classValues }) => ({ id, geometry, fields, classValues })),
    },
    map: {
      background: map.background,
      layers: map.layers.map(({ layerId, sourceLayers, zIndex, casing, style }) => ({
        layerId, sources: sourceLayers, order: zIndex, geometry: style.geom,
        symbol: style.symbolizer, casing, label: style.label, scale: style.scale,
        classification: style.classification ? {
          field: style.classification.field,
          classes: style.classification.classes.map(({ filter, symbolizer, scale }) => ({ filter, symbol: symbolizer, scale })),
          fallback: style.classification.fallback,
          fallbackScale: style.classification.fallbackScale,
        } : undefined,
      })),
    },
    changes: input.changes ? {
      mode: input.changes.mode,
      changedLayerIds: input.changes.mode === "patch" ? input.changes.changedLayerIds : undefined,
      unsupported: input.changes.unsupported,
      missingData: input.changes.missingData,
    } : undefined,
    pixelChecks: { metrics: input.pixelMetrics, warnings: input.warnings ?? [] },
    repairAttempts: input.repairAttempts ?? 0,
  };
}
