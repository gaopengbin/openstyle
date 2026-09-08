import { describe, expect, it } from "vitest";
import {
  OpenStyleDiffSchema,
  RenderArtifactSchema,
  RepairPatchSchema,
  ReviewReportSchema,
  StyleProfileSchema,
  assertRepairPatchTarget,
} from "../src/index.js";

const patch = RepairPatchSchema.parse({
  schemaVersion: "1.0.0",
  id: "repair-1",
  targetOpenStyleRef: "openstyle://night@4",
  targetIssueIds: ["issue-1"],
  operations: [{ op: "replace", path: "/layers/roads/style/label/fontSize", value: 10 }],
  reason: "Reduce label collisions",
  expectedImpact: "Fewer overlapping road names",
  rollbackRef: "openstyle://night@4",
  createdAt: "2026-08-24T00:01:00.000Z",
});

describe("cartography evidence contracts", () => {
  it("keeps reference-derived style separate from a dataset or renderer", () => {
    const profile = StyleProfileSchema.parse({
      schemaVersion: "1.0.0",
      id: "style-profile-strategy-1",
      title: "Layered strategy map",
      source: {
        kind: "reference-image",
        referenceRef: "reference://sha256/example",
        name: "reference.webp",
        mediaType: "image/webp",
        contentHash: "sha256:example",
      },
      visualLanguage: {
        family: "strategy-game",
        mood: ["tactical", "terrain-led"],
        contrast: "high",
        density: "dense",
        dimensionality: "relief",
        summary: "Terrain-led command map with continuous faction territory.",
      },
      palette: [
        { role: "background", color: "#24251E", usage: "terrain ground" },
        { role: "primary", color: "#7E9BE8", usage: "northern faction" },
        { role: "accent", color: "#A9C65C", usage: "southern faction" },
      ],
      hierarchy: [{ role: "capital", priority: 10, treatment: "large portrait marker" }],
      typography: {
        character: "condensed labels with dark shield",
        casing: "preserve",
        weightContrast: "strong",
        halo: "strong",
        density: "balanced",
      },
      geometry: {
        lineCharacter: "bright front lines over subdued roads",
        areaTreatment: "continuous faction territory",
        boundaryTreatment: "thin luminous border",
        roadCasing: "subtle",
      },
      effects: [{
        name: "terrain",
        intent: "visible mountain relief",
        portability: "adapter-required",
        fallback: "muted terrain tint",
      }],
      transferRules: [{
        semanticRole: "administrative-area",
        visualRole: "faction-territory",
        strategy: "fill every area with the assigned faction color",
        priority: 9,
      }],
      confidence: 0.86,
      assumptions: ["Faction ownership is supplied by the target dataset."],
      extractedBy: "vision-model@example",
      createdAt: "2026-09-03T00:00:00.000Z",
    });

    expect(profile.visualLanguage.family).toBe("strategy-game");
    expect(profile.source).not.toHaveProperty("datasetRef");
    expect(profile.effects[0]?.portability).toBe("adapter-required");
  });

  it("binds render and review evidence to exact style versions", () => {
    const render = RenderArtifactSchema.parse({
      id: "render-1",
      adapterId: "openlayers",
      renderer: "openlayers",
      sourceRef: "snapshot://city@1",
      styleRef: "openstyle://night@4",
      scenario: {
        id: "desktop",
        label: "Desktop",
        projection: "EPSG:4326",
        extent: [120, 30, 122, 32],
        viewport: { width: 1440, height: 900 },
        background: "#07111f",
      },
      output: { kind: "image", ref: "screenshot://render-1" },
      contentHash: "sha256:example",
      createdAt: "2026-08-24T00:00:00.000Z",
      reproducible: true,
    });
    const review = ReviewReportSchema.parse({
      schemaVersion: "1.0.0",
      id: "review-1",
      openStyleRef: render.styleRef,
      renderRefs: [render.id, render.output.ref],
      reviewer: "visual-reviewer@1",
      issues: [{ id: "issue-1", source: "visual", severity: "warning", code: "labels.dense", message: "Labels overlap" }],
      verdict: "needs-repair",
      createdAt: "2026-08-24T00:00:30.000Z",
    });
    expect(review.openStyleRef).toBe(render.styleRef);
  });

  it("rejects a patch aimed at another style version", () => {
    expect(assertRepairPatchTarget(patch, "openstyle://night@4").id).toBe("repair-1");
    expect(() => assertRepairPatchTarget(patch, "openstyle://night@5")).toThrow(/targets/);
  });

  it("records an auditable OpenStyle diff", () => {
    const diff = OpenStyleDiffSchema.parse({
      schemaVersion: "1.0.0",
      id: "diff-1",
      baseOpenStyleRef: patch.targetOpenStyleRef,
      targetOpenStyleRef: "openstyle://night@5",
      operations: patch.operations,
      changedLayerIds: ["roads"],
      summary: patch.reason,
      createdAt: "2026-08-24T00:02:00.000Z",
    });
    expect(diff.changedLayerIds).toEqual(["roads"]);
  });
});
