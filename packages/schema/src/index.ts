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

/**
 * Explicit escape hatch for adapter-specific features. Extensions are always
 * namespaced by adapter id so engine-specific knobs never look portable.
 */
export const OpenStyleExtensionsSchema = z.record(z.string(), z.record(z.string(), z.unknown()));
export type OpenStyleExtensions = z.infer<typeof OpenStyleExtensionsSchema>;

// ---------------------------------------------------------------------------
// Scale range
// ---------------------------------------------------------------------------

/**
 * A scale range for zoom-dependent rules. Values are OGC SLD-style scale
 * *denominators*: `50000` means "at zoom levels where the map scale is 1:50 000".
 * Bigger denominator = more zoomed out.
 *
 * Both bounds are optional. When both are set, `minScaleDenominator` must be
 * ≤ `maxScaleDenominator` (the range would otherwise never match).
 *
 * Attach a `ScaleRange` to a `StyleRuleClass`, a `classification.fallbackScale`,
 * or to the top-level `StyleModel.scale` when using a single symbolizer. The
 * compiler emits `<MinScaleDenominator>` / `<MaxScaleDenominator>` in the
 * corresponding SLD Rule.
 */
export const ScaleRangeSchema = z
  .object({
    /** Include features when the current map denominator is ≥ this value. */
    minScaleDenominator: z.number().positive().optional(),
    /** Include features when the current map denominator is ≤ this value. */
    maxScaleDenominator: z.number().positive().optional(),
  })
  .refine(
    (s) =>
      s.minScaleDenominator == null ||
      s.maxScaleDenominator == null ||
      s.minScaleDenominator <= s.maxScaleDenominator,
    {
      message:
        "minScaleDenominator must be ≤ maxScaleDenominator (larger denominator = more zoomed out).",
    },
  );
export type ScaleRange = z.infer<typeof ScaleRangeSchema>;

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * A single class in an attribute-based classification (choropleth, etc.).
 * `filter` narrows features by a single field/op/value; `symbolizer` is what
 * matching features look like. `scale` (optional) limits the class to a zoom
 * range — useful for showing detail categories only at large scales.
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
  /** Zoom range for this class — undefined means "at every scale". */
  scale: ScaleRangeSchema.optional(),
});
export type StyleRuleClass = z.infer<typeof StyleRuleClassSchema>;

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

/**
 * TextSymbolizer configuration for label rendering.
 * OGC SLD 1.0 § 11.6 (TextSymbolizer).
 */
/**
 * Where a label sits relative to the feature it decorates.
 *
 * - `point` — the OGC-default placement. Anchor + offset + rotation. Fine for
 *   point features, and (for lines/polygons) for a single label near the
 *   geometry's centroid.
 * - `line` — SLD 1.0 `<LinePlacement>` with GeoServer vendor options that
 *   make the label follow the road's shape, repeat at intervals, group
 *   collinear features under one label, etc. Only meaningful for line
 *   geometries. Setting `kind: "line"` on a polygon/point style is rejected
 *   by the top-level refine below.
 *
 * VendorOption fields map 1:1 to GeoServer's labelling vendor options:
 * https://docs.geoserver.org/latest/en/user/styling/sld/reference/labeling.html
 */
export const PointLabelPlacementSchema = z.object({
  kind: z.literal("point"),
  /** SLD AnchorPointX in [0, 1]. 0 = left, 1 = right. Defaults to 0.5. */
  anchorX: z.number().min(0).max(1).optional(),
  /** SLD AnchorPointY in [0, 1]. 0 = bottom, 1 = top. Defaults to 0.5. */
  anchorY: z.number().min(0).max(1).optional(),
  /** Pixel offset from the anchor. */
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
  /** Rotation in degrees, clockwise. */
  rotation: z.number().optional(),
});
export type PointLabelPlacement = z.infer<typeof PointLabelPlacementSchema>;

export const LineLabelPlacementSchema = z.object({
  kind: z.literal("line"),
  /** Perpendicular offset in pixels — positive = left of line direction. */
  perpendicularOffset: z.number().optional(),
  /** VendorOption `followLine`. When true, the label bends along the line. */
  followLine: z.boolean().optional(),
  /** VendorOption `repeat` — repeat the label every N pixels along the line. */
  repeat: z.number().positive().optional(),
  /**
   * VendorOption `maxDisplacement` — how far in pixels the renderer may push
   * a label sideways to fit it. Bigger = more forgiving placement.
   */
  maxDisplacement: z.number().nonnegative().optional(),
  /**
   * VendorOption `maxAngleDelta` — maximum angle (deg) between consecutive
   * characters. Prevents letters from wrapping around sharp corners.
   */
  maxAngleDelta: z.number().nonnegative().optional(),
  /**
   * VendorOption `group` — when "yes", collinear features that share the
   * `field` value get one shared label instead of one label each.
   */
  group: z.boolean().optional(),
  /** VendorOption `autoWrap` — auto wrap long labels at N pixels. */
  autoWrap: z.number().positive().optional(),
  /** VendorOption `spaceAround` — minimum spacing to any other label. */
  spaceAround: z.number().nonnegative().optional(),
});
export type LineLabelPlacement = z.infer<typeof LineLabelPlacementSchema>;

export const LabelPlacementSchema = z.discriminatedUnion("kind", [
  PointLabelPlacementSchema,
  LineLabelPlacementSchema,
]);
export type LabelPlacement = z.infer<typeof LabelPlacementSchema>;

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
  /**
   * How the label is anchored. Omit → GeoServer default (equivalent to a
   * point placement centred on the geometry). Set `kind: "line"` to follow
   * the line direction — the compiler emits `<LinePlacement>` and the
   * relevant `<VendorOption>` block.
   */
  placement: LabelPlacementSchema.optional(),
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
        /** Zoom range for the else-rule. Independent of individual class scales. */
        fallbackScale: ScaleRangeSchema.optional(),
      })
      .optional(),
    /** Single-rule styling (no classification). */
    symbolizer: AnySymbolizerSchema.optional(),
    /**
     * Zoom range for the single-symbolizer rule. Only meaningful when
     * `symbolizer` is set (classification uses per-class `scale` instead).
     */
    scale: ScaleRangeSchema.optional(),
    /** Optional TextSymbolizer overlay. */
    label: StyleLabelSchema.optional(),
    /** Explicit, namespaced adapter extensions. */
    extensions: OpenStyleExtensionsSchema.optional(),
  })
  .refine((m) => Boolean(m.classification) || Boolean(m.symbolizer), {
    message:
      "StyleModel must have either `symbolizer` (single rule) or `classification` (attribute-based).",
  })
  .refine(
    (m) => m.label?.placement?.kind !== "line" || m.geom === "line",
    {
      message:
        "label.placement.kind: 'line' is only valid on line-geometry styles. Use kind: 'point' (or omit placement) for point/polygon geometries.",
      path: ["label", "placement", "kind"],
    },
  );
export type StyleModel = z.infer<typeof StyleModelSchema>;

// ---------------------------------------------------------------------------
// OpenStyle (whole-map canonical model)
// ---------------------------------------------------------------------------

export const OpenStyleSourceSelectorSchema = z
  .object({
    sourceRef: z.string().min(1).optional(),
    roles: z.array(z.string().min(1)).min(1).optional(),
    sourceLayers: z.array(z.string().min(1)).min(1).optional(),
    geometry: StyleModelGeomSchema.optional(),
  })
  .refine((selector) => Boolean(selector.roles?.length || selector.sourceLayers?.length), {
    message: "OpenStyle selector requires at least one semantic role or source layer.",
  });
export type OpenStyleSourceSelector = z.infer<typeof OpenStyleSourceSelectorSchema>;

export const OpenStyleLayerSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    selector: OpenStyleSourceSelectorSchema,
    zIndex: z.number().int().optional(),
    style: StyleModelSchema,
    extensions: OpenStyleExtensionsSchema.optional(),
  })
  .superRefine((layer, context) => {
    if (layer.selector.geometry && layer.selector.geometry !== layer.style.geom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selector", "geometry"],
        message: `selector geometry ${layer.selector.geometry} does not match style geometry ${layer.style.geom}`,
      });
    }
  });
export type OpenStyleLayer = z.infer<typeof OpenStyleLayerSchema>;

/** Canonical, renderer-independent whole-map style. */
export const OpenStyleSchema = z
  .object({
    schemaVersion: z.literal("0.6.0"),
    id: z.string().min(1),
    name: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    intentRef: z.string().min(1).optional(),
    background: z.string().optional(),
    layers: z.array(OpenStyleLayerSchema).min(1),
    metadata: z
      .object({
        authors: z.array(z.string().min(1)).optional(),
        tags: z.array(z.string().min(1)).optional(),
        createdAt: z.string().datetime().optional(),
        updatedAt: z.string().datetime().optional(),
      })
      .optional(),
    extensions: OpenStyleExtensionsSchema.optional(),
  })
  .superRefine((style, context) => {
    const seen = new Set<string>();
    style.layers.forEach((layer, index) => {
      if (seen.has(layer.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["layers", index, "id"],
          message: `duplicate OpenStyle layer id: ${layer.id}`,
        });
      }
      seen.add(layer.id);
    });
  });
export type OpenStyle = z.infer<typeof OpenStyleSchema>;

export interface OpenStyleValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateOpenStyle(style: unknown): OpenStyleValidation {
  const parsed = OpenStyleSchema.safeParse(style);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      errors.push(`${path}: ${issue.message}`);
    }
    return { ok: false, errors, warnings };
  }

  for (const layer of parsed.data.layers) {
    const validation = validateStyleModel(layer.style);
    warnings.push(...validation.warnings.map((warning) => `${layer.id}: ${warning}`));
    if (!layer.selector.sourceLayers?.length) {
      warnings.push(`${layer.id}: semantic roles require a source binding before rendering`);
    }
  }
  return { ok: true, errors, warnings };
}

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
  if (m.classification && m.scale) {
    warnings.push(
      "top-level `scale` is ignored when `classification` is set — put scale on each class or on `classification.fallbackScale` instead",
    );
  }
  return { ok: true, errors, warnings };
}
