import { z } from "zod";

export * from "./line-casing.js";
export * from "./style-patch.js";
export * from "./render-quality.js";
export * from "./review-context.js";

export const GeometryKindSchema = z.enum(["point", "line", "polygon", "mixed"]);
export type GeometryKind = z.infer<typeof GeometryKindSchema>;

export const LayerFieldProfileSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  nullable: z.boolean().optional(),
  distinctCount: z.number().int().nonnegative().optional(),
  sampleValues: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).max(32).optional(),
});
export type LayerFieldProfile = z.infer<typeof LayerFieldProfileSchema>;

export const LayerProfileSchema = z.object({
  id: z.string().min(1),
  sourceRef: z.string().min(1),
  role: z.string().min(1).optional(),
  geometry: GeometryKindSchema,
  crs: z.string().min(1),
  featureCount: z.number().int().nonnegative(),
  extent: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  fields: z.array(LayerFieldProfileSchema),
  sampleSize: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  provenance: z.object({
    method: z.enum(["schema", "sample", "statistics", "user-declared"]),
    localOnly: z.boolean(),
    capturedAt: z.string().datetime(),
  }),
});
export type LayerProfile = z.infer<typeof LayerProfileSchema>;

export const CartographyIntentSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().min(1),
  title: z.string().optional(),
  request: z.string().min(1),
  medium: z.enum(["interactive-map", "dashboard", "print", "mobile", "presentation", "unknown"]),
  audience: z.array(z.string().min(1)).min(1),
  mood: z.array(z.string().min(1)).optional(),
  focusRoles: z.array(z.string().min(1)).optional(),
  hierarchy: z.array(z.object({ role: z.string().min(1), priority: z.number().int().min(1).max(10) })).optional(),
  labelDensity: z.enum(["minimal", "restrained", "balanced", "dense"]).optional(),
  contrast: z.enum(["low", "medium", "high"]).optional(),
  scaleStrategy: z.enum(["single-scale", "overview-to-detail", "print-fixed"]).optional(),
  paletteConstraints: z.object({
    background: z.string().optional(),
    preferred: z.array(z.string()).optional(),
    avoid: z.array(z.string()).optional(),
  }).optional(),
  referenceRefs: z.array(z.string().min(1)).optional(),
  assumptions: z.array(z.string().min(1)).optional(),
});
export type CartographyIntent = z.infer<typeof CartographyIntentSchema>;

/**
 * A transferable visual style extracted from a reference, independent of any
 * one dataset or renderer. The Agent binds these semantic decisions to real
 * source layers before producing OpenStyle StyleModels.
 */
export const StyleProfileDraftSchema = z.object({
  visualLanguage: z.object({
    family: z.enum([
      "editorial",
      "navigation-game",
      "strategy-game",
      "historic-paper",
      "military",
      "civic",
      "minimal",
      "other",
    ]),
    mood: z.array(z.string().min(1)).min(1).max(6),
    contrast: z.enum(["low", "medium", "high"]),
    density: z.enum(["minimal", "restrained", "balanced", "dense"]),
    dimensionality: z.enum(["flat", "relief", "three-dimensional"]),
    summary: z.string().min(1).max(600),
  }),
  palette: z.array(z.object({
    role: z.enum([
      "background",
      "land",
      "water",
      "primary",
      "secondary",
      "accent",
      "text",
      "halo",
      "boundary",
    ]),
    color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
    usage: z.string().min(1).max(240),
  })).min(3).max(12),
  hierarchy: z.array(z.object({
    role: z.string().min(1).max(120),
    priority: z.number().int().min(1).max(10),
    treatment: z.string().min(1).max(300),
  })).min(1).max(16),
  typography: z.object({
    character: z.string().min(1).max(200),
    casing: z.enum(["preserve", "uppercase", "lowercase", "mixed"]),
    weightContrast: z.enum(["subtle", "moderate", "strong"]),
    halo: z.enum(["none", "subtle", "strong"]),
    density: z.enum(["minimal", "restrained", "balanced", "dense"]),
  }),
  geometry: z.object({
    lineCharacter: z.string().min(1).max(240),
    areaTreatment: z.string().min(1).max(240),
    boundaryTreatment: z.string().min(1).max(240),
    roadCasing: z.enum(["none", "subtle", "strong"]),
  }),
  effects: z.array(z.object({
    name: z.string().min(1).max(120),
    intent: z.string().min(1).max(240),
    portability: z.enum(["portable", "adapter-required", "unsupported"]),
    fallback: z.string().min(1).max(240).optional(),
  })).max(12),
  transferRules: z.array(z.object({
    semanticRole: z.string().min(1).max(120),
    visualRole: z.string().min(1).max(120),
    strategy: z.string().min(1).max(300),
    priority: z.number().int().min(1).max(10),
  })).min(1).max(20),
  confidence: z.number().min(0).max(1),
  assumptions: z.array(z.string().min(1).max(300)).max(12).default([]),
});
export type StyleProfileDraft = z.infer<typeof StyleProfileDraftSchema>;

export const StyleProfileSchema = StyleProfileDraftSchema.extend({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  source: z.object({
    kind: z.enum(["reference-image", "curated-reference"]),
    referenceRef: z.string().min(1),
    name: z.string().min(1),
    mediaType: z.string().min(1).optional(),
    contentHash: z.string().min(1).optional(),
  }),
  extractedBy: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type StyleProfile = z.infer<typeof StyleProfileSchema>;

export const CartographyRendererKindSchema = z.enum(["openlayers", "wms-named-style", "maplibre", "qgis", "cesium"]);
export type CartographyRendererKind = z.infer<typeof CartographyRendererKindSchema>;

export const RenderScenarioSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  projection: z.string().min(1),
  extent: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  background: z.string().min(1),
});
export type RenderScenario = z.infer<typeof RenderScenarioSchema>;

export const RenderArtifactSchema = z.object({
  schemaVersion: z.literal("1.0.0").default("1.0.0"),
  id: z.string().min(1),
  adapterId: z.string().min(1),
  renderer: CartographyRendererKindSchema,
  sourceRef: z.string().min(1),
  styleRef: z.string().min(1),
  scenario: RenderScenarioSchema,
  output: z.object({ kind: z.enum(["interactive-map", "image"]), ref: z.string().min(1) }),
  contentHash: z.string().min(1),
  createdAt: z.string().datetime(),
  reproducible: z.boolean(),
  lineage: z.object({
    agentRunId: z.string().min(1).optional(),
    styleModelNames: z.array(z.string().min(1)),
    validator: z.string().min(1),
    compiler: z.string().min(1),
    sourceSnapshot: z.string().min(1),
  }).optional(),
});
export type RenderArtifact = z.infer<typeof RenderArtifactSchema>;

export const ReviewIssueSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["deterministic", "visual", "user"]),
  severity: z.enum(["info", "warning", "error"]),
  code: z.string().min(1),
  message: z.string().min(1),
  layerIds: z.array(z.string().min(1)).optional(),
  evidenceRefs: z.array(z.string().min(1)).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;

export const ReviewReportSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().min(1),
  openStyleRef: z.string().min(1),
  renderRefs: z.array(z.string().min(1)).min(1),
  reviewer: z.string().min(1),
  issues: z.array(ReviewIssueSchema),
  verdict: z.enum(["pass", "needs-repair", "blocked"]),
  createdAt: z.string().datetime(),
});
export type ReviewReport = z.infer<typeof ReviewReportSchema>;

export const RepairOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), path: z.string().startsWith("/"), value: z.unknown() }),
  z.object({ op: z.literal("replace"), path: z.string().startsWith("/"), value: z.unknown() }),
  z.object({ op: z.literal("remove"), path: z.string().startsWith("/") }),
]);
export type RepairOperation = z.infer<typeof RepairOperationSchema>;

export const RepairPatchSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().min(1),
  targetOpenStyleRef: z.string().min(1),
  targetIssueIds: z.array(z.string().min(1)).min(1),
  operations: z.array(RepairOperationSchema).min(1),
  reason: z.string().min(1),
  expectedImpact: z.string().min(1),
  rollbackRef: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type RepairPatch = z.infer<typeof RepairPatchSchema>;

export const OpenStyleDiffSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().min(1),
  baseOpenStyleRef: z.string().min(1),
  targetOpenStyleRef: z.string().min(1),
  operations: z.array(RepairOperationSchema).min(1),
  changedLayerIds: z.array(z.string().min(1)),
  summary: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type OpenStyleDiff = z.infer<typeof OpenStyleDiffSchema>;

export function assertRepairPatchTarget(patch: RepairPatch, openStyleRef: string) {
  const validated = RepairPatchSchema.parse(patch);
  if (validated.targetOpenStyleRef !== openStyleRef) {
    throw new Error(`RepairPatch targets ${validated.targetOpenStyleRef}, not ${openStyleRef}`);
  }
  return validated;
}
