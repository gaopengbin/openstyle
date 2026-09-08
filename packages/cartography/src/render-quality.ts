/** Deterministic diagnostics for pixels that the caller has already rendered. */
export interface RenderPixelMetrics {
  schemaVersion: "0.1";
  sampleCount: number;
  inkRatio: number;
  luminanceContrast: number;
  meanChroma: number;
  edgeDensity: number;
}

export type RenderRgbColor = readonly [number, number, number];
export interface RenderPixelInput {
  data: ArrayLike<number>;
  width: number;
  height: number;
  background: string;
  sampleStep?: number;
  /** Resolve named or extended CSS colors when the built-in hex/rgb parser cannot. */
  parseColor?: (value: string) => RenderRgbColor | null | undefined;
}

function roundMetric(value: number) { return Math.round(value * 10_000) / 10_000; }

function parseHexColor(value: string): RenderRgbColor | null {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return null;
  const expanded = hex.length === 3 ? hex.split("").map((character) => character.repeat(2)).join("") : hex;
  return [Number.parseInt(expanded.slice(0, 2), 16), Number.parseInt(expanded.slice(2, 4), 16), Number.parseInt(expanded.slice(4, 6), 16)];
}

function parseRgbChannel(value: string) {
  const trimmed = value.trim();
  const parsed = trimmed.endsWith("%") ? Number.parseFloat(trimmed) * 2.55 : Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(255, Math.round(parsed))) : null;
}

function parseRgbColor(value: string): RenderRgbColor | null {
  const match = value.trim().match(/^rgba?\(\s*([^,\s/]+)[,\s]+([^,\s/]+)[,\s]+([^,\s/)]+)(?:\s*[,/]\s*[^)]+)?\s*\)$/i);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const red = parseRgbChannel(match[1]);
  const green = parseRgbChannel(match[2]);
  const blue = parseRgbChannel(match[3]);
  return red === null || green === null || blue === null ? null : [red, green, blue];
}

function resolveBackground(value: string, parseColor?: RenderPixelInput["parseColor"]): RenderRgbColor {
  const direct = parseHexColor(value) ?? parseRgbColor(value);
  if (direct) return direct;
  const resolved = parseColor?.(value);
  if (resolved?.length === 3 && resolved.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)) return resolved;
  throw new Error(`Pixel diagnostics cannot resolve the CSS background color: ${value}`);
}

function percentileFromHistogram(histogram: Uint32Array, sampleCount: number, percentile: number) {
  const target = Math.max(1, Math.ceil(sampleCount * percentile));
  let accumulated = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    accumulated += histogram[index] ?? 0;
    if (accumulated >= target) return index;
  }
  return histogram.length - 1;
}

/**
 * Measures RGB channels in an RGBA buffer without decoding images or reading a
 * browser surface. The caller supplies composited pixels; alpha is not blended.
 * The default two-pixel grid, thresholds and four-decimal rounding are stable.
 */
export function measureRenderPixels(input: RenderPixelInput): RenderPixelMetrics {
  const { data, width, height } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || data.length < width * height * 4) {
    throw new Error("Pixel diagnostics require a valid RGBA image buffer.");
  }
  const sampleStep = input.sampleStep ?? 2;
  if (!Number.isInteger(sampleStep) || sampleStep <= 0) throw new Error("Pixel diagnostic sampleStep must be a positive integer.");
  const background = resolveBackground(input.background, input.parseColor);
  const histogram = new Uint32Array(256);
  let sampleCount = 0;
  let inkCount = 0;
  let chromaSum = 0;
  let edgeCount = 0;
  let edgeComparisons = 0;
  const offsetAt = (x: number, y: number) => (y * width + x) * 4;
  const channelDistance = (left: number, right: number) => (
    Math.abs(Number(data[left]) - Number(data[right]))
    + Math.abs(Number(data[left + 1]) - Number(data[right + 1]))
    + Math.abs(Number(data[left + 2]) - Number(data[right + 2]))
  ) / 3;
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const offset = offsetAt(x, y);
      const red = Number(data[offset]);
      const green = Number(data[offset + 1]);
      const blue = Number(data[offset + 2]);
      const deltaRed = red - background[0];
      const deltaGreen = green - background[1];
      const deltaBlue = blue - background[2];
      if (Math.sqrt(deltaRed * deltaRed + deltaGreen * deltaGreen + deltaBlue * deltaBlue) > 22) inkCount += 1;
      const luminance = Math.max(0, Math.min(255, Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue)));
      histogram[luminance] = (histogram[luminance] ?? 0) + 1;
      chromaSum += (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
      sampleCount += 1;
      if (x + sampleStep < width) {
        if (channelDistance(offset, offsetAt(x + sampleStep, y)) > 18) edgeCount += 1;
        edgeComparisons += 1;
      }
      if (y + sampleStep < height) {
        if (channelDistance(offset, offsetAt(x, y + sampleStep)) > 18) edgeCount += 1;
        edgeComparisons += 1;
      }
    }
  }
  const p05 = percentileFromHistogram(histogram, sampleCount, 0.05);
  const p95 = percentileFromHistogram(histogram, sampleCount, 0.95);
  return {
    schemaVersion: "0.1", sampleCount,
    inkRatio: roundMetric(inkCount / sampleCount),
    luminanceContrast: roundMetric((p95 - p05) / 255),
    meanChroma: roundMetric(chromaSum / sampleCount),
    edgeDensity: roundMetric(edgeComparisons > 0 ? edgeCount / edgeComparisons : 0),
  };
}

export function visualWarningsForMetrics(metrics: RenderPixelMetrics): string[] {
  const warnings: string[] = [];
  if (metrics.inkRatio < 0.06) warnings.push("visual-coverage-low: fewer than 6% of sampled pixels separate clearly from the background");
  if (metrics.luminanceContrast < 0.08) warnings.push("visual-contrast-low: the rendered 5th–95th percentile luminance spread is below 8%");
  if (metrics.edgeDensity > 0.3) warnings.push("visual-density-high: local edge density exceeds 30% and may indicate clutter");
  return warnings;
}

/** Only the change extent is needed; applications retain their patch contract. */
export interface QualityChangeSummary {
  mode: "full" | "patch";
  changedLayerIds: readonly string[];
  changedFields: readonly unknown[];
}
export interface RenderQualityEvidence {
  bundleId: string;
  renderedFeatures: number;
  pixelMetrics?: RenderPixelMetrics;
}
export interface RenderQualityIssue {
  category: "intent" | "reference" | "labels" | "hierarchy" | "contrast" | "missing-data" | "unsupported";
  severity: "warning" | "error";
  message: string;
  layerIds?: string[];
}
/** Diagnostic state, not a replacement for the portable ReviewReport contract. */
export interface RenderQualityReport {
  bundleId: string;
  schema: "pass" | "failed";
  render: "pending" | "pass" | "failed";
  visual: "pending" | "pass" | "needs-repair" | "unavailable" | "not-reviewed" | "user-accepted";
  method: "structural" | "vision" | "manual";
  summary: string;
  issues: RenderQualityIssue[];
  reviewedAt?: string;
}

export function needsVisionReview(change?: QualityChangeSummary): boolean {
  return !change || change.mode !== "patch" || change.changedLayerIds.length > 3 || change.changedFields.length > 8;
}

/**
 * Review deterministic evidence for an already schema-validated candidate.
 * This does not perform schema validation or vision review, and never marks
 * visual intent as passed. A clock value is supplied only by the caller.
 */
export function structuralRenderReview(input: RenderQualityEvidence, change?: QualityChangeSummary, options: { reviewedAt?: string } = {}): RenderQualityReport {
  const warnings = input.pixelMetrics ? visualWarningsForMetrics(input.pixelMetrics) : [];
  const issues: RenderQualityIssue[] = warnings.map((message) => ({ category: message.startsWith("visual-density") ? "labels" : "contrast", severity: "warning", message }));
  if (input.renderedFeatures === 0) issues.unshift({ category: "missing-data", severity: "error", message: "The current render contains no map features." });
  const requiresVision = needsVisionReview(change);
  if (!input.pixelMetrics) issues.push({ category: "contrast", severity: "warning", message: "Pixel measurements were not supplied for the rendered map." });
  return {
    bundleId: input.bundleId,
    schema: "pass",
    render: input.renderedFeatures > 0 ? "pass" : "failed",
    visual: issues.length ? "needs-repair" : requiresVision ? "pending" : "not-reviewed",
    method: "structural",
    summary: issues.length ? "The rendered candidate needs attention." : requiresVision ? "The map rendered; visual intent review is pending." : "The local edit passed schema, render and pixel checks; no vision-model review was run.",
    issues,
    ...(options.reviewedAt !== undefined ? { reviewedAt: options.reviewedAt } : {}),
  };
}

export function mayRepair(report: Pick<RenderQualityReport, "visual" | "issues">, attempts: number, limit = 2): boolean {
  return attempts < limit && report.visual === "needs-repair" && !report.issues.some((issue) => issue.category === "missing-data" || issue.category === "unsupported");
}
