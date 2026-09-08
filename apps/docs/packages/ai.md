# @openstyle/ai

Prompt construction, response extraction and validation for map styling, plus pure request and output-budget policies. Bring your own model SDK and transport.

| API | Purpose |
| --- | --- |
| `buildSystemPrompt`, `describeLayer` | Give the model the style grammar and real source fields |
| `extractJson`, `validateModelFieldRefs` | Extract style JSON and validate field references |
| `validateSldPreflight`, `summarizeSldDiff` | Inspect SLD output |
| `rewriteChatRequestBody` | Apply an explicit model override, output cap and supported thinking setting |
| `readPositiveInteger`, `readThinkingMode` | Parse configuration supplied by the caller |
| `summarizeModelStep` | Keep finish reason and counters without retaining response or reasoning text |
| `nextOutputBudgetState` | Signal a stop after two consecutive output-limit responses without a tool call |

Request policies preserve multimodal messages, tool definitions and tool choice. A smaller caller token limit is retained; model-specific thinking fields are restricted to the implementation's explicit supported-model list. Invalid JSON is passed through for the caller to handle.

These functions do not read environment variables, store keys, send requests or perform retries. Output-budget state reports when to stop; it does not increase the budget or initiate another call. See the [0.7.0 package README](https://github.com/gaopengbin/openstyle/tree/v0.7.0/packages/ai) for exact behavior and examples. The policy helpers are included in the GitHub prerelease bundle; follow the [bundle installation guide](../guide/getting-started), since npm publication is not complete.
