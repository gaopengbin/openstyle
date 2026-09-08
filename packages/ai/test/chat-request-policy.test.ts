import { describe, expect, it } from "vitest";
import {
  readPositiveInteger,
  readThinkingMode,
  rewriteChatRequestBody,
  type ChatRequestPolicy,
} from "../src/index.js";

const toolRequest = {
  model: "caller-default",
  messages: [
    { role: "system", content: "Review the rendered map and use the review tool." },
    { role: "user", content: [
      { type: "text", text: "Are roads legible against the dark background?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,fixture", detail: "high" } },
    ] },
  ],
  tools: [{ type: "function", function: {
    name: "submit_review", strict: true, description: "Return a structured map review.",
    parameters: { type: "object", properties: { readable: { type: "boolean" } }, required: ["readable"], additionalProperties: false },
  } }],
  tool_choice: "required",
  parallel_tool_calls: false,
  stream: false,
  max_tokens: 600,
};

describe("rewriteChatRequestBody", () => {
  it("rewrites a complete multimodal tool request without altering messages, tools or strictness", () => {
    const raw = JSON.stringify(toolRequest);
    const policy: ChatRequestPolicy = { modelOverride: " deepseek-v4-flash-vision-exp ", maxOutputTokens: 1_024, thinkingMode: "disabled" };
    const result = rewriteChatRequestBody(raw, policy);
    expect(JSON.parse(result.body)).toEqual({ ...toolRequest, model: "deepseek-v4-flash-vision-exp", thinking: { type: "disabled" } });
    expect(result).toMatchObject({
      requestedModel: "caller-default", resolvedModel: "deepseek-v4-flash-vision-exp",
      effectiveMaxOutputTokens: 600, thinkingMode: "disabled",
    });
    expect(JSON.stringify(toolRequest)).toBe(raw);
    expect(policy.modelOverride).toBe(" deepseek-v4-flash-vision-exp ");
  });

  it("caps both token fields and never raises the chosen valid requested limit", () => {
    const larger = rewriteChatRequestBody(JSON.stringify({ max_tokens: 20_000, max_completion_tokens: 20_000 }), { maxOutputTokens: 8_192 });
    expect(JSON.parse(larger.body)).toEqual({ max_tokens: 8_192, max_completion_tokens: 8_192 });
    const smaller = rewriteChatRequestBody(JSON.stringify({ max_completion_tokens: 400 }), { maxOutputTokens: 8_192 });
    expect(JSON.parse(smaller.body)).toEqual({ max_tokens: 400, max_completion_tokens: 400 });
    expect(smaller.effectiveMaxOutputTokens).toBe(400);
  });

  it("retains max_tokens precedence when both legacy token fields are present", () => {
    const result = rewriteChatRequestBody(JSON.stringify({ max_tokens: 300, max_completion_tokens: 900 }), { maxOutputTokens: 600 });
    expect(JSON.parse(result.body)).toEqual({ max_tokens: 300, max_completion_tokens: 300 });
  });

  it("injects a cap without requiring a model override or an existing token field", () => {
    const result = rewriteChatRequestBody(JSON.stringify({ model: "custom-model", messages: [] }), { maxOutputTokens: 8_192 });
    expect(JSON.parse(result.body)).toEqual({ model: "custom-model", messages: [], max_tokens: 8_192 });
    expect(result.effectiveMaxOutputTokens).toBe(8_192);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("ignores invalid policy cap %s", (cap) => {
    const result = rewriteChatRequestBody(JSON.stringify({ max_tokens: 300 }), { maxOutputTokens: cap });
    expect(JSON.parse(result.body)).toEqual({ max_tokens: 300 });
    expect(result.effectiveMaxOutputTokens).toBe(300);
  });

  it("ignores invalid requested limits instead of treating them as a valid budget", () => {
    const result = rewriteChatRequestBody(JSON.stringify({ max_tokens: "600", max_completion_tokens: -1 }), { maxOutputTokens: 512 });
    expect(JSON.parse(result.body)).toEqual({ max_tokens: 512, max_completion_tokens: 512 });
  });

  it("preserves GPT reasoning and response format without injecting a DeepSeek extension", () => {
    const request = { ...toolRequest, reasoning_effort: "low", response_format: { type: "json_object" }, thinking: { type: "enabled" } };
    const result = rewriteChatRequestBody(JSON.stringify(request), { modelOverride: "gpt-5.6-terra", thinkingMode: "disabled" });
    const { thinking: _thinking, ...expected } = request;
    expect(JSON.parse(result.body)).toEqual({ ...expected, model: "gpt-5.6-terra" });
    expect(result.thinkingMode).toBeUndefined();
  });

  it.each([undefined, "caller-default", "claude-sonnet", "unknown-reasoner", "not-deepseek-v4-flash", "deepseek-v2", "deepseek-v3.2", "deepseek-chat", "deepseek-reasoner", "deepseek/deepseek-v4-flash"])(
    "does not infer thinking support for route %s", (model) => {
      const result = rewriteChatRequestBody(JSON.stringify({ model, thinking: { type: "enabled" } }), { thinkingMode: "enabled" });
      expect(JSON.parse(result.body)).not.toHaveProperty("thinking");
      expect(result.thinkingMode).toBeUndefined();
    },
  );

  it.each(["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-v4-flash-vision-exp"])(
    "applies explicit thinking policy only to the resolved supported model %s", (modelOverride) => {
      const result = rewriteChatRequestBody(JSON.stringify({ model: "caller-default", thinking: { type: "disabled" } }), { modelOverride, thinkingMode: "enabled" });
      expect(JSON.parse(result.body).thinking).toEqual({ type: "enabled" });
      expect(result.thinkingMode).toBe("enabled");
    },
  );

  it("removes stale thinking when the model override changes to an unsupported route", () => {
    const result = rewriteChatRequestBody(JSON.stringify({ model: "deepseek-v4-flash", thinking: { type: "enabled" }, tools: toolRequest.tools }), { modelOverride: "gpt-5.6-terra", thinkingMode: "disabled" });
    expect(JSON.parse(result.body)).toEqual({ model: "gpt-5.6-terra", tools: toolRequest.tools });
    expect(result.requestedModel).toBe("deepseek-v4-flash");
  });

  it("keeps supported request thinking when the policy does not override it", () => {
    const result = rewriteChatRequestBody(JSON.stringify({ model: "deepseek-v4-flash", thinking: { type: "disabled" } }), { modelOverride: "  " });
    expect(JSON.parse(result.body)).toEqual({ model: "deepseek-v4-flash", thinking: { type: "disabled" } });
    expect(result.thinkingMode).toBeUndefined();
  });

  it.each(["", "not-json", "null"])("passes through unrewritable body %s", (raw) => {
    expect(rewriteChatRequestBody(raw, { maxOutputTokens: 8_192 })).toEqual({ body: raw });
  });
});

describe("caller-provided configuration parsing", () => {
  it.each([undefined, "", "  ", "0", "-1", "1.5", "Infinity", "NaN", "nope"])("rejects invalid positive integer %s", (value) => {
    expect(readPositiveInteger(value)).toBeUndefined();
  });

  it("accepts positive integers without accessing process configuration", () => {
    expect(readPositiveInteger("8192")).toBe(8_192);
    expect(readPositiveInteger(" 600 ")).toBe(600);
    expect(readPositiveInteger("1e3")).toBe(1_000);
    expect(readThinkingMode(" ENABLED ")).toBe("enabled");
    expect(readThinkingMode(" disabled ")).toBe("disabled");
    expect(readThinkingMode("auto")).toBeUndefined();
    expect(readThinkingMode(undefined)).toBeUndefined();
  });
});
