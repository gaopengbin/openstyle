import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCALE_LADDER,
  FEW_SHOT_EXAMPLES,
  PALETTES,
  findPalette,
  findScaleTier,
} from "../src/index.js";

describe("@openstyle/manual", () => {
  it("exposes typed collections", () => {
    expect(Array.isArray(DEFAULT_SCALE_LADDER)).toBe(true);
    expect(Array.isArray(PALETTES)).toBe(true);
    expect(Array.isArray(FEW_SHOT_EXAMPLES)).toBe(true);
  });

  it("lookups return undefined for unknown ids", () => {
    expect(findPalette("nope")).toBeUndefined();
    expect(findScaleTier("nope")).toBeUndefined();
  });

  it("DEFAULT_SCALE_LADDER covers named web-map tiers with sane ordering", () => {
    expect(DEFAULT_SCALE_LADDER.length).toBeGreaterThanOrEqual(6);
    const ids = DEFAULT_SCALE_LADDER.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "world",
        "country",
        "region",
        "city",
        "district",
        "street",
        "building",
      ]),
    );
    for (const tier of DEFAULT_SCALE_LADDER) {
      if (tier.minDenominator != null && tier.maxDenominator != null) {
        // ScaleTier bounds are inclusive: min ≤ denominator ≤ max.
        // "min" is the lower bound (more zoomed-in end),
        // "max" is the upper bound (more zoomed-out end).
        expect(tier.minDenominator).toBeLessThanOrEqual(tier.maxDenominator);
      }
    }
  });

  it("findScaleTier resolves known ids", () => {
    const city = findScaleTier("city");
    expect(city).toBeDefined();
    expect(city?.label).toContain("City");
  });
});
