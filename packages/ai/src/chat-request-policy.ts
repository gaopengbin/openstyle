/** The thinking extension supported by the explicitly listed chat models. */
export type ChatThinkingMode = "enabled" | "disabled";

/** Caller-owned policy for an already serialized Chat Completions request. */
export interface ChatRequestPolicy {
  modelOverride?: string;
  maxOutputTokens?: number;
  thinkingMode?: ChatThinkingMode;
}

export interface RewrittenChatRequest {
  body: string;
  requestedModel?: string;
  resolvedModel?: string;
  effectiveMaxOutputTokens?: number;
  thinkingMode?: ChatThinkingMode;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * `thinking: {type}` is a DeepSeek Chat Completions extension, not a universal
 * OpenAI-compatible field. Keep support explicit rather than guessing from
 * model names or an advertised reasoning capability.
 * https://api-docs.deepseek.com/api/create-chat-completion/
 */
function supportsThinkingParameter(model: string | undefined) {
  return Boolean(model && ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-v4-flash-vision-exp"].includes(model));
}

/**
 * Apply model, output-cap, and supported thinking policy without performing I/O.
 * Messages, tools, images, and unrelated provider options remain unchanged.
 * Malformed JSON passes through so the caller retains its own error handling.
 */
export function rewriteChatRequestBody(raw: string, policy: ChatRequestPolicy): RewrittenChatRequest {
  if (!raw) return { body: raw };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const requestedModel = typeof parsed.model === "string" ? parsed.model : undefined;
    const resolvedModel = policy.modelOverride?.trim() || requestedModel;
    if (resolvedModel) parsed.model = resolvedModel;

    const requestedLimit = positiveInteger(parsed.max_tokens) ?? positiveInteger(parsed.max_completion_tokens);
    const policyCap = positiveInteger(policy.maxOutputTokens);
    const effectiveMaxOutputTokens = policyCap && requestedLimit
      ? Math.min(policyCap, requestedLimit)
      : policyCap ?? requestedLimit;

    if (effectiveMaxOutputTokens) {
      parsed.max_tokens = effectiveMaxOutputTokens;
      if ("max_completion_tokens" in parsed) parsed.max_completion_tokens = effectiveMaxOutputTokens;
    }

    const thinkingSupported = supportsThinkingParameter(resolvedModel);
    const thinkingMode = thinkingSupported ? policy.thinkingMode : undefined;
    if (thinkingMode) parsed.thinking = { type: thinkingMode };
    else if (!thinkingSupported) delete parsed.thinking;

    return {
      body: JSON.stringify(parsed),
      requestedModel,
      resolvedModel,
      effectiveMaxOutputTokens,
      thinkingMode,
    };
  } catch {
    return { body: raw };
  }
}

/** Parse a caller-provided string; no environment variables are read here. */
export function readPositiveInteger(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function readThinkingMode(value: string | undefined): ChatThinkingMode | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === "enabled" || normalized === "disabled" ? normalized : undefined;
}
