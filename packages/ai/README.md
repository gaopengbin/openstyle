# @openstyle/ai

> Prompt builders, JSON extraction, and structural validators for LLM-driven `StyleModel` generation. Bring your own provider SDK.

## Install

Version 0.7.0 is distributed in the [GitHub prerelease bundle](https://github.com/gaopengbin/openstyle/releases/tag/v0.7.0). Extract `openstyle-0.7.0-bundle.zip` and run `pnpm install` from its directory. Keep its local tarballs and `pnpm.overrides` when integrating these packages. Third-party dependencies still require registry access or a populated cache; npm publication of this version is pending.

## What's in here

| Export | Purpose |
| --- | --- |
| `buildSystemPrompt()` | Canonical instruction preamble that mirrors `@openstyle/schema` |
| `describeLayer(layer, samples?)` | Compact layer schema + feature samples block for the user turn |
| `inferStyleModelGeom(rawGeom)` | Map an OGC geometry name to `"point" \| "line" \| "polygon"` |
| `extractJson(text)` | Best-effort JSON extraction from a model response (fenced or prose) |
| `validateModelFieldRefs(model, layer)` | Confirm every `classification.field` / `label.field` exists on the layer |
| `validateSldPreflight(sld)` | Regex-based structural checks on SLD XML (no DOM required) |
| `summarizeSldDiff(prev, current)` | Line-based diff for review UIs |
| `rewriteChatRequestBody(raw, policy)` | Apply a model override, output cap, and explicitly supported thinking mode to a serialized chat request |
| `readPositiveInteger(value)` / `readThinkingMode(value)` | Parse caller-provided configuration strings without reading the environment |
| `summarizeModelStep(step)` | Extract finish reason and token/text/tool counts without retaining response or reasoning text |
| `nextOutputBudgetState(previous, step)` | Stop after two consecutive output-limit responses that returned no tool call |

## Usage sketch

```ts
import { buildSystemPrompt, describeLayer, extractJson, validateModelFieldRefs } from "@openstyle/ai";
import { StyleModelSchema } from "@openstyle/schema";
import { compileToSld } from "@openstyle/compiler";

const messages = [
  { role: "system", content: buildSystemPrompt() },
  { role: "user", content: `${describeLayer(layer, samples)}\n\nStyling request: highlight major cities in orange.` },
];

// Use whatever LLM you like — Vercel AI SDK, Anthropic SDK, OpenAI, etc.
const response = await callYourLLM(messages);
const raw = extractJson(response.content);
const model = StyleModelSchema.parse(raw);

const issues = validateModelFieldRefs(model, layer);
if (issues.length) throw new Error(issues.map((i) => i.detail).join("\n"));

const sld = compileToSld(model);
```

## Chat request policy and bounded output retries

```ts
import {
  rewriteChatRequestBody,
  summarizeModelStep,
  nextOutputBudgetState,
  type OutputBudgetState,
} from "@openstyle/ai";

const request = rewriteChatRequestBody(JSON.stringify({
  model: "caller-default",
  messages,
  tools,
  tool_choice: "required",
  max_tokens: 600,
}), {
  modelOverride: "deepseek-v4-flash",
  maxOutputTokens: 8192,
  thinkingMode: "disabled",
});
// request.body retains the lower 600-token limit, messages, and tool schema.
// Your application sends the request and supplies response metadata below.

let budget: OutputBudgetState | undefined;
const step = summarizeModelStep({
  finishReason: "length",
  reasoningTokens: 0,
  content: [],
  toolCallCount: 0,
});
budget = nextOutputBudgetState(budget, step); // shouldStop: false on first exhaustion
budget = nextOutputBudgetState(budget, step); // shouldStop: true on a second in a row
```

These helpers do not load credentials, read environment variables, send requests,
or depend on an AI SDK. The caller owns authentication, transport, cancellation,
retry scheduling, and preservation of the previous map. The budget helper signals
when to stop; it does not raise token limits or initiate another request.

The `thinking` extension is enabled only for the exact model IDs
`deepseek-v4-flash`, `deepseek-v4-pro`, and `deepseek-v4-flash-vision-exp`.
Unsupported or unknown model IDs have that extension removed, including when a
model override switches providers. Other fields such as `reasoning_effort`,
multimodal messages, and strict tool definitions remain unchanged. A supported
model's existing thinking setting stays unchanged when the policy has no override.
Malformed JSON passes through for the caller to handle; this helper does not
replace request or model-output validation.

Output caps accept positive integers and respect a smaller requested limit.
When both token fields exist, `max_tokens` takes precedence; the chosen limit is
also written to `max_completion_tokens`. `summarizeModelStep` reports observed
metadata only: absent token usage stays absent, and text length counts ordinary
text parts in JavaScript string units. It does not inspect or persist reasoning
text, infer visual quality, or calculate a final provider bill.

## Why the split

- `@openstyle/schema` — the *shape*
- `@openstyle/compiler` — the *output*
- `@openstyle/ai` — the *glue* between an LLM and the schema

If your app doesn't use LLMs, you can skip this package entirely.

## License

MIT
