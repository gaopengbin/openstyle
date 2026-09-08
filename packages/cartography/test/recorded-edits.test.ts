import { describe, expect, it } from "vitest";
import linyi from "./fixtures/linyi-water.json";
import newYork from "./fixtures/new-york-casing.json";
import { OpenStyleSchema } from "@openstyle/schema";
import { applyOpenStylePatch, OpenStylePatchProfileSchema, OpenStylePatchSchema } from "../src/style-patch.js";

describe("recorded real map edits from GeoStyle", () => {
  for (const [name, fixture] of [["Linyi water colors", linyi], ["New York road casing", newYork]] as const) {
    it(`replays ${name} to the actual accepted canonical style without a model or browser`, () => {
      const input = {
        style: OpenStyleSchema.parse(fixture.input.style),
        profile: OpenStylePatchProfileSchema.parse(fixture.input.profile),
        patch: OpenStylePatchSchema.parse(fixture.input.patch),
        resultId: fixture.input.resultId,
      };
      const before = JSON.stringify(input.style);
      const result = applyOpenStylePatch(input);
      expect(OpenStyleSchema.parse(result.style)).toEqual(OpenStyleSchema.parse(fixture.expected));
      expect(JSON.stringify(input.style)).toBe(before);
      expect(result.changeSummary.changedFields).toHaveLength(fixture.input.patch.operations.length);
    });
  }
});
