import { describe, expect, it } from "vitest";
import type { OpenStyle } from "@openstyle/schema";
import { collectRequiredCapabilities, negotiateOpenStyleCapabilities } from "../src/index.js";

const style: OpenStyle = {
  schemaVersion: "0.6.0",
  id: "roads",
  name: "Road hierarchy",
  layers: [{
    id: "roads",
    selector: { roles: ["transportation"], sourceLayers: ["transportation"], geometry: "line" },
    style: {
      name: "roads",
      geom: "line",
      symbolizer: { kind: "line", stroke: "#ffcc66", strokeWidth: 3, dasharray: "4 2" },
      label: { field: "name", placement: { kind: "line", followLine: true, repeat: 160 } },
    },
  }],
};

describe("adapter capability negotiation", () => {
  it("derives capabilities from the canonical style", () => {
    expect(collectRequiredCapabilities(style)).toEqual(expect.arrayContaining([
      "selector.semantic-role",
      "style.line.basic",
      "style.line.dash",
      "style.label.line-follow",
    ]));
  });

  it("reports emulation explicitly and blocks missing support", () => {
    const required = collectRequiredCapabilities(style);
    const supported = negotiateOpenStyleCapabilities(style, {
      adapterId: "test",
      target: "canvas",
      capabilities: Object.fromEntries(required.map((capability) => [capability, capability === "style.label.repeat" ? "emulated" : "native"])),
    });
    expect(supported.ok).toBe(true);
    expect(supported.emulated).toEqual(["style.label.repeat"]);
    expect(negotiateOpenStyleCapabilities(style, { adapterId: "limited", target: "image", capabilities: {} }).ok).toBe(false);
  });
});
