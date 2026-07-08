/**
 * @openstyle/manual — cookbook-distilled reference material for AI-driven
 * styling. This package is intentionally *content-heavy* rather than
 * logic-heavy: it exports data structures that downstream packages (and
 * humans) can consult, not runtime behavior.
 *
 * Content planned (all currently empty stubs — contributions welcome):
 * - Scale ladders (map scales for zoom levels, dpi assumptions)
 * - Named colour palettes (ColorBrewer, viridis, discrete categorical sets)
 * - Few-shot examples (real user prompts → real StyleModels)
 * - Field-type heuristics (numeric → choropleth; categorical → filled polygons; etc.)
 *
 * Nothing here is stable yet. Expect churn.
 */
import type { StyleModel } from "@openstyle/schema";

// ---------------------------------------------------------------------------
// Scale ladders
// ---------------------------------------------------------------------------

/**
 * A named scale range. `denominator` values are OGC SLD-style scale
 * denominators — larger means more zoomed out (1:1_000_000 = "1000000").
 */
export interface ScaleTier {
  id: string;
  label: string;
  /** Show at or above this denominator (inclusive). Undefined = no lower bound. */
  minDenominator?: number;
  /** Show at or below this denominator (inclusive). Undefined = no upper bound. */
  maxDenominator?: number;
}

/**
 * Reasonable default ladder for common web-map zoom levels.
 *
 * Anchored to a 96-DPI web map and roughly aligned with OSM's z0-z18
 * (see https://wiki.openstreetmap.org/wiki/Zoom_levels). Denominators are
 * ballparks — many real deployments override them for specific layers.
 *
 * Feed to an LLM as "these are the common breakpoints; pick the tier that
 * matches what the user asked for", or use `findScaleTier(id)` to grab a
 * named range for a manually authored StyleModel.
 */
export const DEFAULT_SCALE_LADDER: ScaleTier[] = [
  {
    id: "world",
    label: "World (z0-z3)",
    minDenominator: 100_000_000,
  },
  {
    id: "country",
    label: "Country (z4-z6)",
    minDenominator: 10_000_000,
    maxDenominator: 100_000_000,
  },
  {
    id: "region",
    label: "Region / province (z7-z9)",
    minDenominator: 1_000_000,
    maxDenominator: 10_000_000,
  },
  {
    id: "city",
    label: "City (z10-z12)",
    minDenominator: 100_000,
    maxDenominator: 1_000_000,
  },
  {
    id: "district",
    label: "District / neighborhood (z13-z15)",
    minDenominator: 10_000,
    maxDenominator: 100_000,
  },
  {
    id: "street",
    label: "Street (z16-z17)",
    minDenominator: 1_000,
    maxDenominator: 10_000,
  },
  {
    id: "building",
    label: "Building (z18+)",
    maxDenominator: 1_000,
  },
];

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

export interface Palette {
  id: string;
  name: string;
  /** "sequential" | "diverging" | "categorical" — hint for automatic mapping. */
  kind: "sequential" | "diverging" | "categorical";
  colors: string[];
  /** Optional citation, e.g. "ColorBrewer YlOrRd-5" */
  source?: string;
}

/**
 * Named palettes an AI can request by id. Empty for now.
 */
export const PALETTES: Palette[] = [];

// ---------------------------------------------------------------------------
// Few-shot examples
// ---------------------------------------------------------------------------

export interface FewShotExample {
  id: string;
  prompt: string;
  /** Compact one-line description of the target layer. */
  layerHint: string;
  model: StyleModel;
}

/**
 * Curated (prompt, model) pairs for injecting into system prompts.
 * Empty for now.
 */
export const FEW_SHOT_EXAMPLES: FewShotExample[] = [];

// ---------------------------------------------------------------------------
// Convenience lookups
// ---------------------------------------------------------------------------

export function findPalette(id: string): Palette | undefined {
  return PALETTES.find((p) => p.id === id);
}

export function findScaleTier(id: string): ScaleTier | undefined {
  return DEFAULT_SCALE_LADDER.find((t) => t.id === id);
}
