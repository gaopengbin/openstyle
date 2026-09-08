/** Minimal response shape; no provider SDK types or reasoning text are needed. */
export interface ModelStepInput {
  finishReason?: string;
  reasoningTokens?: number;
  content?: readonly { type: string; text?: string }[];
  toolCallCount: number;
}

/** Safe to persist as diagnostics: counts and termination metadata only. */
export interface ModelStepSummary {
  finishReason?: string;
  reasoningTokens?: number;
  textLength: number;
  toolCallCount: number;
}

export function summarizeModelStep(input: ModelStepInput): ModelStepSummary {
  return {
    finishReason: input.finishReason,
    reasoningTokens: input.reasoningTokens,
    textLength: (input.content ?? []).reduce(
      (length, part) => length + (part.type === "text" ? (part.text?.length ?? 0) : 0),
      0,
    ),
    toolCallCount: input.toolCallCount,
  };
}

export interface OutputBudgetState {
  consecutiveExhaustedWithoutTool: number;
  exhaustedWithoutTool: boolean;
  shouldStop: boolean;
}

/**
 * Allow one bounded retry after output exhaustion without a tool call; stop on
 * the second consecutive occurrence. This only computes state: callers own
 * retries, cancellation, candidate preservation, and user-visible errors.
 */
export function nextOutputBudgetState(
  previous: OutputBudgetState | undefined,
  step: Pick<ModelStepSummary, "finishReason" | "toolCallCount">,
): OutputBudgetState {
  const exhaustedWithoutTool = step.finishReason === "length" && step.toolCallCount === 0;
  const consecutiveExhaustedWithoutTool = exhaustedWithoutTool
    ? (previous?.consecutiveExhaustedWithoutTool ?? 0) + 1
    : 0;
  return {
    consecutiveExhaustedWithoutTool,
    exhaustedWithoutTool,
    shouldStop: consecutiveExhaustedWithoutTool >= 2,
  };
}
