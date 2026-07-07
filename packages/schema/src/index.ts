/**
 * @openstyle/schema — canonical StyleModel schema and types.
 *
 * The zod schemas here are the *source of truth*. TypeScript types are
 * inferred from them so runtime validation and compile-time types can't drift.
 *
 * A StyleModel is a bounded JSON shape that describes a map style at a
 * higher altitude than SLD XML — geometry kind, symbolizers, optional
 * attribute-based classification, and optional labels. The compiler
 * (`@openstyle/compiler`) turns it into OGC SLD 1.0 XML deterministically.
 *
 * Design principles:
 * - **Small**: every field earns its place. Adding a knob means the
 *   compiler and the AI prompt manual both need updating.
 * - **Additive**: schema changes are additive across minor versions. A
 *   valid StyleModel from a previous minor version stays valid.
 * - **AI-friendly**: field names are self-explanatory, enums are short,
 *   nesting is shallow.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Geometry & filter ops
// ---------------------------------------------------------------------------

export const StyleModelGeomSchema = z.enum(["point", "line", "polygon"]);
export type StyleModelGeom = z.infer<typeof StyleModelGeomSchema>;

export const ClassifyOpSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "in",
  "like",
]);
export type ClassifyOp = z.infer<typeof ClassifyOpSchema>;

// ---------------------------------------------------------------------------
// Symbolizers
// ---------------------------------------------------------------------------

/**
 * Point symbolizer — a Mark (well-known shape) or an external graphic.
 * OGC SLD 1.0 § 11.3 (PointSymbolizer).
 */
export const PointSymbolizerSchema = z.object({
  kind: z.literal("point"),
  /** SLD WellKnownName: circle / square / triangle / star / cross / x. */
  shape: z.string().optional(),
  /** External graphic URL — resolves to a GeoServer resource or local asset. */
  externalGraphic: z.string().optional(),
  fill: z.string(),
  fillOpacity: z.number().min(0).max(1).optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().nonnegative().optional(),
  size: z.number().positive(),
  rotation: z.number().optional(),
});
export type PointSymbolizer = z.infer<typeof PointSymbolizerSchema>;

/**
 * Line symbolizer — colour, width, dash pattern, caps and joins.
 * OGC SLD 1.0 § 11.4 (LineSymbolizer).
 */
export const LineSymbolizerSchema = z.object({
  kind: z.literal("line"),
  stroke: z.string(),
  strokeWidth: z.number().nonnegative(),
  strokeOpacity: z.number().min(0).max(1).optional(),
  /** Dash pattern, e.g. `"5 2"`. */
  dasharray: z.string().optional(),
  linecap: z.enum(["butt", "round", "square"]).optional(),
  linejoin: z.enum(["miter", "round", "bevel"]).optional(),
});
export type LineSymbolizer = z.infer<typeof LineSymbolizerSchema>;

/**
 * Polygon symbolizer — fill and optional stroke.
 * OGC SLD 1.0 § 11.5 (PolygonSymbolizer).
 */
export const PolygonSymbolizerSchema = z.object({
  kind: z.literal("polygon"),
  fill: z.string(),
  fillOpacity: z.number().min(0).max(1).optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().nonnegative().optional(),
  strokeOpacity: z.number().min(0).max(1).optional(),
  strokeDasharray: z.string().optional(),
});
export type PolygonSymbolizer = z.infer<typeof PolygonSymbolizerSchema>;

export const AnySymbolizerSchema = z.discriminatedUnion("kind", [
  PointSymbolizerSchema,
  LineSymbolizerSchema,
  PolygonSymbolizerSchema,
]);
export type AnySymbolizer = z.infer<typeof AnySymbolizerSchema>;

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * A single class in an attribute-based classification (choropleth, etc.).
 * `filter` narrows features by a single field/op/value; `symbolizer` is what
 * matching features look like.
 */
export const StyleRuleClassSchema = z.object({
  /** Legend label. */
  label: z.string(),
  /** Filter on a single field. */
  filter: z.object({
    op: ClassifyOpSchema,
    value: z.union([
      z.string(),
      z.number(),
      z.array(z.union([z.string(), z.number()])),
    ]),
  }),
  symbolizer: AnySymbolizerSchema,
});
export type StyleRuleClass = z.infer<typeof StyleRuleClassSchema>;

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

/**
 * TextSymbolizer configuration for label rendering.
 * OGC SLD 1.0 § 11.6 (TextSymbolizer).
 */
export const StyleLabelSchema = z.object({
  field: z.string(),
  fontFamily: z.string().optional(),
  fontSize: z.number().positive().optional(),
  fontColor: z.string().optional(),
  haloColor: z.string().optional(),
  haloWidth: z.number().nonnegative().optional(),
  /** Only render labels when the map is between these scales. */
  minScale: z.number().nonnegative().optional(),
  maxScale: z.number().nonnegative().optional(),
});
export type StyleLabel = z.infer<typeof StyleLabelSchema>;

// ---------------------------------------------------------------------------
// StyleModel (top level)
// ---------------------------------------------------------------------------

/**
 * Top-level StyleModel. Must have either `symbolizer` (single rule) or
 * `classification` (attribute-based, one rule per class + optional fallback).
 * `label` renders a TextSymbolizer on top of whichever rule matches.
 */
export const StyleModelSchema = z
  .object({
    name: z.string().min(1),
    title: z.string().optional(),
    geom: StyleModelGeomSchema,
    /** Attribute-based classification (choropleth, categorical, etc.). */
    classification: z
      .object({
        field: z.string().min(1),
        classes: z.array(StyleRuleClassSchema).min(1),
        /** Fallback symbolizer for features not matched by any class. */
        fallback: AnySymbolizerSchema.optional(),
      })
      .optional(),
    /** Single-rule styling (no classification). */
    symbolizer: AnySymbolizerSchema.optional(),
    /** Optional TextSymbolizer overlay. */
    label: StyleLabelSchema.optional(),
  })
  .refine((m) => Boolean(m.classification) || Boolean(m.symbolizer), {
    message:
      "StyleModel must have either `symbolizer` (single rule) or `classification` (attribute-based).",
  });
export type StyleModel = z.infer<typeof StyleModelSchema>;

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface StyleModelValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Human-readable validation on top of the zod parse — surfaces the same
 * shape errors plus warnings the schema can't catch (e.g. missing fallback).
 *
 * Prefer `StyleModelSchema.safeParse()` when you want the raw zod error;
 * use this when you want a diagnostic list to render in a UI.
 */
export function validateStyleModel(model: unknown): StyleModelValidation {
  const parsed = StyleModelSchema.safeParse(model);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      errors.push(`${path}: ${issue.message}`);
    }
    return { ok: false, errors, warnings };
  }

  const m = parsed.data;
  if (!m.classification?.fallback && !m.symbolizer) {
    warnings.push(
      "no fallback symbolizer — features outside every class will not render",
    );
  }
  return { ok: true, errors, warnings };
}
