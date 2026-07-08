---
"@openstyle/ai": minor
"@openstyle/schema": minor
"@openstyle/compiler": minor
"@openstyle/manual": minor
---

Prompt hard rule: labels asked by the user MUST be emitted.

The model was observed to hallucinate schema limitations (e.g. "StyleModel does not support multiple symbolizers per class, so I skip the label") and quietly drop labels the user explicitly asked for. The prompt now:

- Enumerates every synonym for "label" the user might use — English and Chinese — and says any of them makes `label` REQUIRED.
- Instructs the model to pick a name-like field for `label.field` and stop making up reasons to skip.
- Explicitly names the "invent a limitation" failure mode as a thing NOT to do.

Only `@openstyle/ai` has a substantive change; the other packages are bumped for lockstep.
