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
 * Empty for now — filled in a follow-up PR after we agree on stops.
 */
export const DEFAULT_SCALE_LADDER: ScaleTier[] = [];

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
