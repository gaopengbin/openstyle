/**
 * @openstyle/ai — helpers for driving LLMs to produce StyleModels.
 *
 * This package deliberately does NOT bring an HTTP client or provider
 * integration. It gives you:
 *   - `buildSystemPrompt()` — the canonical instruction preamble
 *   - `describeLayer()` — a compact schema+samples block for the user turn
 *   - `validateModelFieldRefs()` — post-generation check that classification
 *     and label fields exist on the target layer
 *   - `summarizeSldDiff()` — line-based diff between two SLD strings, useful
 *     for surfacing "what changed" in review UIs
 *   - `extractJson()` — best-effort JSON extraction from a model response
 *     that may include fenced or prose wrappers
 *
 * Bring your own LLM call (Vercel AI SDK, Anthropic SDK, OpenAI SDK, etc.).
 */
import type { StyleModel } from "@openstyle/schema";

// ---------------------------------------------------------------------------
// Layer context (minimal, provider-agnostic)
// ---------------------------------------------------------------------------

/**
 * Minimal layer shape needed for prompt building and field-ref validation.
 * Bring your own richer type — this only reads what it uses.
 */
export interface LayerContext {
  workspace: string;
  name: string;
  /** OGC geometry family, e.g. "Point" / "LineString" / "Polygon" / "MultiPolygon". */
  geom: string;
  crs?: string;
  description?: string;
  fields: Array<{ name: string; type: string; desc?: string }>;
}

/** Map a raw OGC geometry name to the StyleModel geom enum. */
export function inferStyleModelGeom(geom: string): "point" | "line" | "polygon" {
  const g = (geom || "").toLowerCase();
  if (g.includes("point")) return "point";
  if (g.includes("line") || g.includes("curve")) return "line";
  return "polygon";
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * Canonical instruction preamble for StyleModel-producing LLM calls.
 * Feed this as the `system` message. The shape mirrors @openstyle/schema.
 *
 * The prompt is intentionally terse — every rule earns its place, and the
 * JSON shape example is the ground truth. If you change the schema, update
 * this template in lockstep.
 */
export function buildSystemPrompt(): string {
  return `You are a GeoServer SLD styling expert.
Return only one strict JSON object that matches this TypeScript shape:
{
  "name": "ascii_style_name",
  "title": "Readable title",
  "geom": "point | line | polygon",
  "symbolizer": {
    "kind": "point | line | polygon",
    "shape": "circle",
    "fill": "#RRGGBB",
    "fillOpacity": 0.85,
    "stroke": "#RRGGBB",
    "strokeWidth": 1.5,
    "size": 10
  },
  "classification": {
    "field": "existing field name",
    "classes": [
      {
        "label": "legend label",
        "filter": { "op": "eq | neq | gt | gte | lt | lte | between | in | like", "value": "string, number, or array" },
        "symbolizer": { "kind": "polygon", "fill": "#RRGGBB", "stroke": "#RRGGBB", "strokeWidth": 1 }
      }
    ],
    "fallback": { "kind": "polygon", "fill": "#9CA3AF", "stroke": "#4B5563", "strokeWidth": 1 }
  },
  "label": { "field": "existing field name", "fontSize": 12, "fontColor": "#111827", "haloColor": "#FFFFFF", "haloWidth": 1 }
}
Rules:
- Use only real layer fields when adding classification or labels.
- Prefer fields and class breaks that are supported by the real WFS sample values.
- Avoid filters for values that do not appear in the provided layer schema or samples.
- Use classification only when the user asks for class breaks, categories, or field-based color.
- Otherwise use a single symbolizer.
- For raster layers, output geom as polygon.
- Do not include markdown, comments, or explanation.`;
}

// ---------------------------------------------------------------------------
// Layer descriptor (user-turn context)
// ---------------------------------------------------------------------------

function sampleValue(value: unknown): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 96 ? `${value.slice(0, 93)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 4).map(sampleValue);
  if (typeof value === "object") return "[object]";
  return String(value);
}

function summarizeSamples(samples: Record<string, unknown>[] | undefined): string {
  if (!samples?.length) return "No feature samples were available.";
  const rows = samples.slice(0, 8).map((sample) =>
    Object.fromEntries(
      Object.entries(sample)
        .slice(0, 14)
        .map(([key, value]) => [key, sampleValue(value)]),
    ),
  );
  return JSON.stringify(rows, null, 2);
}

/**
 * Format a layer + optional feature samples into a compact context block.
 * Feed the return value inside the `user` message alongside the styling
 * request — the LLM needs both to pick real field names and value breaks.
 */
export function describeLayer(
  layer: LayerContext,
  samples?: Record<string, unknown>[],
): string {
  const fields = layer.fields
    .map((field) => `- ${field.name}: ${field.type}${field.desc ? ` (${field.desc})` : ""}`)
    .join("\n");

  return `Layer: ${layer.workspace}:${layer.name}
Geometry: ${layer.geom}
CRS: ${layer.crs ?? "N/A"}
Description: ${layer.description || "N/A"}
Fields:
${fields || "- No fields returned by GeoServer"}
Real WFS feature property samples:
${summarizeSamples(samples)}`;
}

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

/**
 * Extract a JSON object from a possibly-fenced or prose-wrapped model
 * response. Tries strict parse first, then falls back to grabbing the
 * first `{...}` block. Throws if nothing parses.
 */
export function extractJson<T = unknown>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* fallthrough */
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      /* fallthrough */
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* fallthrough */
    }
  }

  throw new Error("The AI response did not contain valid JSON.");
}

// ---------------------------------------------------------------------------
// Field reference validation
// ---------------------------------------------------------------------------

export type IssueSeverity = "ok" | "warn" | "block";

export interface StyleIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  detail: string;
}

function collectFieldReferences(model: StyleModel | null): Set<string> {
  const refs = new Set<string>();
  if (!model) return refs;
  if (model.classification?.field) refs.add(model.classification.field);
  if (model.label?.field) refs.add(model.label.field);
  return refs;
}

/**
 * Ensure every field the StyleModel references (classification, label) exists
 * on the target layer. Any missing reference becomes a `block`-severity issue.
 */
export function validateModelFieldRefs(
  model: StyleModel | null,
  layer: LayerContext | undefined,
): StyleIssue[] {
  if (!model || !layer) return [];
  const fields = new Set(layer.fields.map((field) => field.name));
  return Array.from(collectFieldReferences(model))
    .filter((field) => !fields.has(field))
    .map((field) => ({
      id: `missing-field-${field}`,
      severity: "block" as const,
      title: "StyleModel references an unknown layer field",
      detail: `Field "${field}" does not exist on ${layer.workspace}:${layer.name}.`,
    }));
}

// ---------------------------------------------------------------------------
// SLD preflight (structural)
// ---------------------------------------------------------------------------

/**
 * Structural sanity check on an SLD string prior to publishing.
 * Runs without a DOM parser — regex-based, safe in Node.
 *
 * Returns issues (block/warn) or a single ok entry when everything looks
 * fine. Use alongside `validateModelFieldRefs()` and a real XML validator
 * if strict conformance matters.
 */
export function validateSldPreflight(sld: string): StyleIssue[] {
  const trimmed = sld.trim();
  if (!trimmed) return [];

  const issues: StyleIssue[] = [];

  if (!/<(?:\w+:)?StyledLayerDescriptor[\s>/]/i.test(trimmed)) {
    issues.push({
      id: "sld-root-missing",
      severity: "block",
      title: "Missing SLD root",
      detail: "The SLD must contain a StyledLayerDescriptor root element.",
    });
  }

  if (!/<(?:\w+:)?(?:NamedLayer|UserLayer)[\s>/]/i.test(trimmed)) {
    issues.push({
      id: "sld-layer-missing",
      severity: "block",
      title: "Missing layer definition",
      detail: "The SLD must contain a NamedLayer or UserLayer element.",
    });
  }

  if (!/<(?:\w+:)?Rule[\s>/]/i.test(trimmed)) {
    issues.push({
      id: "sld-rule-missing",
      severity: "block",
      title: "Missing style rule",
      detail: "At least one Rule element is required.",
    });
  }

  if (!/<(?:\w+:)?(?:Point|Line|Polygon|Raster|Text)Symbolizer[\s>/]/i.test(trimmed)) {
    issues.push({
      id: "sld-symbolizer-missing",
      severity: "block",
      title: "Missing symbolizer",
      detail: "At least one Point / Line / Polygon / Raster / Text symbolizer is required.",
    });
  }

  if (/(ascii_style_name|existing field name|Readable title|string, number, or array)/i.test(trimmed)) {
    issues.push({
      id: "sld-placeholder-text",
      severity: "block",
      title: "SLD still contains prompt placeholders",
      detail: "The SLD looks like it echoes the prompt shape rather than a concrete style. Regenerate.",
    });
  }

  if (issues.length === 0) {
    issues.push({
      id: "sld-preflight-ok",
      severity: "ok",
      title: "SLD preflight passed",
      detail: "Structure looks complete: root, layer, rule, and symbolizer are present.",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// SLD diff
// ---------------------------------------------------------------------------

export interface SldDiffSummary {
  headline: string;
  added: string[];
  removed: string[];
}

function significantLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("<?xml"));
}

/**
 * Line-based diff between two SLD documents. Not a semantic diff — good
 * enough for surfacing "what changed" in a review UI. Returns at most
 * `previewLines` added / removed lines.
 */
export function summarizeSldDiff(
  previous: string,
  current: string,
  previewLines = 5,
): SldDiffSummary {
  if (!current.trim()) {
    return {
      headline: "No SLD yet.",
      added: [],
      removed: [],
    };
  }

  if (!previous.trim()) {
    return {
      headline: "First version — nothing to diff against.",
      added: significantLines(current).slice(0, previewLines),
      removed: [],
    };
  }

  const before = significantLines(previous);
  const after = significantLines(current);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((line) => !beforeSet.has(line));
  const removed = before.filter((line) => !afterSet.has(line));

  return {
    headline: `${added.length} added, ${removed.length} removed`,
    added: added.slice(0, previewLines),
    removed: removed.slice(0, previewLines),
  };
}
