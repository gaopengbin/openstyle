import { describe, expect, it } from "vitest";
import { nextOutputBudgetState, summarizeModelStep } from "../src/index.js";

describe("summarizeModelStep", () => {
  it("counts only ordinary text and never returns text or reasoning content", () => {
    const input = {
      finishReason: "tool-calls", reasoningTokens: 19, toolCallCount: 1,
      content: [
        { type: "reasoning", text: "private reasoning must not be persisted" },
        { type: "text", text: "Map " },
        { type: "tool-call", toolName: "submit_patch", input: { color: "#246E87" } },
        { type: "text", text: "updated" },
      ],
    };
    const before = structuredClone(input);
    const result = summarizeModelStep(input);
    expect(result).toEqual({ finishReason: "tool-calls", reasoningTokens: 19, textLength: 11, toolCallCount: 1 });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("#246E87");
    expect(input).toEqual(before);
  });

  it("keeps unavailable usage unavailable and handles an empty response", () => {
    expect(summarizeModelStep({ toolCallCount: 0 })).toEqual({
      finishReason: undefined, reasoningTokens: undefined, textLength: 0, toolCallCount: 0,
    });
    expect(summarizeModelStep({ reasoningTokens: 0, toolCallCount: 0, content: [{ type: "text" }] }).reasoningTokens).toBe(0);
  });
});

describe("nextOutputBudgetState", () => {
  const exhausted = { finishReason: "length", toolCallCount: 0 };

  it("permits one retry and stops after the second consecutive exhausted response without a tool", () => {
    const first = nextOutputBudgetState(undefined, exhausted);
    expect(first).toEqual({ consecutiveExhaustedWithoutTool: 1, exhaustedWithoutTool: true, shouldStop: false });
    const second = nextOutputBudgetState(first, exhausted);
    expect(second).toEqual({ consecutiveExhaustedWithoutTool: 2, exhaustedWithoutTool: true, shouldStop: true });
    expect(first.consecutiveExhaustedWithoutTool).toBe(1);
    expect(nextOutputBudgetState(second, exhausted).shouldStop).toBe(true);
  });

  it.each([
    { finishReason: "length", toolCallCount: 1 },
    { finishReason: "tool-calls", toolCallCount: 2 },
    { finishReason: "stop", toolCallCount: 0 },
    { finishReason: "error", toolCallCount: 0 },
    { toolCallCount: 0 },
  ])("clears consecutive exhaustion after a different response %o", (step) => {
    const first = nextOutputBudgetState(undefined, exhausted);
    const reset = nextOutputBudgetState(first, step);
    expect(reset).toEqual({ consecutiveExhaustedWithoutTool: 0, exhaustedWithoutTool: false, shouldStop: false });
    expect(nextOutputBudgetState(reset, exhausted).shouldStop).toBe(false);
  });
});
