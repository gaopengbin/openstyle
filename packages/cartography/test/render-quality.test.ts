import { describe, expect, it, vi } from "vitest";
import { measureRenderPixels, visualWarningsForMetrics, structuralRenderReview, needsVisionReview, mayRepair, type RenderPixelMetrics, type QualityChangeSummary } from "../src/render-quality";

function image(width: number, height: number, color: readonly [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) data.set([...color, 255], index * 4);
  return data;
}
const good: RenderPixelMetrics = { schemaVersion: "0.1", sampleCount: 1000, inkRatio: 0.4, luminanceContrast: 0.3, meanChroma: 0.1, edgeDensity: 0.1 };
const small: QualityChangeSummary = { mode: "patch", changedLayerIds: ["water"], changedFields: [{ path: "/symbolizer/fill" }] };

describe("renderer-independent RGBA metrics", () => {
  it("preserves the empty-render metrics and warning messages", () => {
    const metrics = measureRenderPixels({ data: image(8, 8, [244, 239, 227]), width: 8, height: 8, background: "#f4efe3", sampleStep: 1 });
    expect(metrics).toEqual({ schemaVersion: "0.1", sampleCount: 64, inkRatio: 0, luminanceContrast: 0, meanChroma: 0.0667, edgeDensity: 0 });
    expect(visualWarningsForMetrics(metrics)).toEqual([
      "visual-coverage-low: fewer than 6% of sampled pixels separate clearly from the background",
      "visual-contrast-low: the rendered 5th–95th percentile luminance spread is below 8%",
    ]);
  });

  it("preserves coverage, weighted-luminance percentile, chroma, edge and rounding values", () => {
    const data = image(8, 8, [255, 255, 255]);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 4; x += 1) data.set([10, 80, 180], (y * 8 + x) * 4);
    expect(measureRenderPixels({ data, width: 8, height: 8, background: "#fff", sampleStep: 1 })).toEqual({
      schemaVersion: "0.1", sampleCount: 64, inkRatio: 0.5, luminanceContrast: 0.7176, meanChroma: 0.3333, edgeDensity: 0.0714,
    });
    expect(measureRenderPixels({ data, width: 8, height: 8, background: "#fff" })).toEqual({
      schemaVersion: "0.1", sampleCount: 16, inkRatio: 0.5, luminanceContrast: 0.7176, meanChroma: 0.3333, edgeDensity: 0.1667,
    });
  });

  it("keeps the strict 22-unit coverage and 18-unit edge thresholds", () => {
    const coverage = (red: number) => measureRenderPixels({ data: image(1, 1, [red, 0, 0]), width: 1, height: 1, background: "#000" });
    expect(coverage(22).inkRatio).toBe(0);
    expect(coverage(23).inkRatio).toBe(1);
    expect(coverage(23).edgeDensity).toBe(0);
    const edge = (channel: number) => measureRenderPixels({ data: [0, 0, 0, 255, channel, channel, channel, 255], width: 2, height: 1, background: "#000", sampleStep: 1 });
    expect(edge(18).edgeDensity).toBe(0);
    expect(edge(19).edgeDensity).toBe(1);
  });

  it("keeps percentile rank and warning boundary semantics", () => {
    const data = image(100, 1, [255, 255, 255]);
    for (let x = 0; x < 4; x += 1) data.set([0, 0, 0], x * 4);
    expect(measureRenderPixels({ data, width: 100, height: 1, background: "#fff", sampleStep: 1 }).luminanceContrast).toBe(0);
    data.set([0, 0, 0], 16);
    expect(measureRenderPixels({ data, width: 100, height: 1, background: "#fff", sampleStep: 1 }).luminanceContrast).toBe(1);
    expect(visualWarningsForMetrics({ ...good, inkRatio: 0.06, luminanceContrast: 0.08, edgeDensity: 0.3 })).toEqual([]);
    expect(visualWarningsForMetrics({ ...good, inkRatio: 0.0599, luminanceContrast: 0.0799, edgeDensity: 0.3001 }).map((value) => value.split(":")[0])).toEqual(["visual-coverage-low", "visual-contrast-low", "visual-density-high"]);
  });

  it("parses hex, rgb and rgba without any browser color parser", () => {
    const parseColor = vi.fn(() => { throw new Error("Fallback must not run for supported colors"); });
    for (const background of ["#fFe", "#ffffee", "rgb(255, 255, 238)", "rgba(255 255 238 / 1)", "rgb(100% 100% 238)"]) {
      expect(measureRenderPixels({ data: image(1, 1, [255, 255, 238]), width: 1, height: 1, background, parseColor }).inkRatio).toBe(0);
    }
    expect(parseColor).not.toHaveBeenCalled();
  });

  it("uses only the injected extended-color resolver and rejects unresolved colors", () => {
    const input = { data: image(1, 1, [255, 0, 0]), width: 1, height: 1, background: "red" };
    const parseColor = vi.fn((value: string) => value === "red" ? [255, 0, 0] as const : null);
    expect(measureRenderPixels({ ...input, parseColor }).inkRatio).toBe(0);
    expect(parseColor).toHaveBeenCalledTimes(1);
    expect(parseColor).toHaveBeenCalledWith("red");
    expect(() => measureRenderPixels(input)).toThrow("Pixel diagnostics cannot resolve the CSS background color: red");
    expect(() => measureRenderPixels({ ...input, parseColor: () => [NaN, 0, 0] })).toThrow("cannot resolve");
    expect(() => measureRenderPixels({ ...input, parseColor: () => [256, 0, 0] })).toThrow("cannot resolve");
  });

  it("rejects malformed buffer dimensions and sampling without mutating the buffer", () => {
    const data = image(2, 2, [10, 20, 30]);
    const before = data.slice();
    for (const [width, height] of [[0, 2], [2.5, 2], [2, -1], [3, 2]] as const) {
      expect(() => measureRenderPixels({ data, width, height, background: "#000" })).toThrow("valid RGBA");
    }
    for (const sampleStep of [0, -1, 1.5]) expect(() => measureRenderPixels({ data, width: 2, height: 2, background: "#000", sampleStep })).toThrow("positive integer");
    measureRenderPixels({ data, width: 2, height: 2, background: "#000" });
    expect(data).toEqual(before);
  });
});

describe("structural quality and bounded repair decisions", () => {
  it("requires vision for full designs or patches beyond three layers or eight fields", () => {
    const boundary: QualityChangeSummary = { mode: "patch", changedLayerIds: ["a", "b", "c"], changedFields: Array(8).fill({ path: "/symbolizer/fill" }) };
    expect(needsVisionReview()).toBe(true);
    expect(needsVisionReview({ ...boundary, mode: "full" })).toBe(true);
    expect(needsVisionReview(boundary)).toBe(false);
    expect(needsVisionReview({ ...boundary, changedLayerIds: ["a", "b", "c", "d"] })).toBe(true);
    expect(needsVisionReview({ ...boundary, changedFields: Array(9).fill("field") })).toBe(true);
  });

  it("does not invent vision success or read a clock for a healthy small edit", () => {
    const input = Object.freeze({ bundleId: "current-style", renderedFeatures: 4072, pixelMetrics: Object.freeze({ ...good }) });
    const report = structuralRenderReview(input, small);
    expect(report).toEqual({ bundleId: "current-style", schema: "pass", render: "pass", visual: "not-reviewed", method: "structural", summary: "The local edit passed schema, render and pixel checks; no vision-model review was run.", issues: [] });
    const reviewedAt = "2026-09-08T01:02:03.000Z";
    expect(structuralRenderReview(input, small, { reviewedAt })).toEqual({ ...report, reviewedAt });
    expect(structuralRenderReview(input).visual).toBe("pending");
    expect(structuralRenderReview(input).summary).toBe("The map rendered; visual intent review is pending.");
  });

  it("flags missing pixels and zero features instead of treating a rendered canvas as success", () => {
    const missingPixels = structuralRenderReview({ bundleId: "map", renderedFeatures: 20 }, small);
    expect(missingPixels).toMatchObject({ render: "pass", visual: "needs-repair", issues: [{ category: "contrast", severity: "warning", message: "Pixel measurements were not supplied for the rendered map." }] });
    const empty = structuralRenderReview({ bundleId: "map", renderedFeatures: 0 }, small);
    expect(empty.render).toBe("failed");
    expect(empty.issues[0]).toEqual({ category: "missing-data", severity: "error", message: "The current render contains no map features." });
    expect(mayRepair(empty, 0)).toBe(false);
  });

  it("retains warning categories and prevents unbounded or impossible automatic repairs", () => {
    const report = structuralRenderReview({ bundleId: "map", renderedFeatures: 20, pixelMetrics: { ...good, inkRatio: 0.01, luminanceContrast: 0.01, edgeDensity: 0.4 } }, small);
    expect(report.issues.map(({ category, severity }) => [category, severity])).toEqual([["contrast", "warning"], ["contrast", "warning"], ["labels", "warning"]]);
    expect(report.summary).toBe("The rendered candidate needs attention.");
    expect(mayRepair(report, 0)).toBe(true);
    expect(mayRepair(report, 1)).toBe(true);
    expect(mayRepair(report, 2)).toBe(false);
    expect(mayRepair(report, 2, 3)).toBe(true);
    for (const visual of ["pending", "pass", "unavailable", "not-reviewed", "user-accepted"] as const) expect(mayRepair({ ...report, visual }, 0)).toBe(false);
    for (const category of ["missing-data", "unsupported"] as const) expect(mayRepair({ ...report, issues: [{ category, severity: "warning", message: "Requires external data or capability" }] }, 0)).toBe(false);
  });
});
