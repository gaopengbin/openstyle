# @openstyle/ai

> Prompt builders, JSON extraction, and structural validators for LLM-driven `StyleModel` generation. Bring your own provider SDK.

## Install

```bash
pnpm add @openstyle/ai @openstyle/schema
```

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

## Why the split

- `@openstyle/schema` — the *shape*
- `@openstyle/compiler` — the *output*
- `@openstyle/ai` — the *glue* between an LLM and the schema

If your app doesn't use LLMs, you can skip this package entirely.

## License

MIT
