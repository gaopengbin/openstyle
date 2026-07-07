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
});
