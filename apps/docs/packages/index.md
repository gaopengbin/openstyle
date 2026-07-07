# Packages

openstyle is a monorepo. Each package can be installed on its own; they compose cleanly.

| Package | Purpose |
| --- | --- |
| [`@openstyle/schema`](./schema) | zod schema + TypeScript types for `StyleModel` |
| [`@openstyle/compiler`](./compiler) | Deterministic `StyleModel` → OGC SLD 1.0 XML emitter |
| [`@openstyle/ai`](./ai) | Prompt builder, JSON extractor, structural validators |
| [`@openstyle/manual`](./manual) | Cookbook-distilled reference material — palettes, scale ladders, few-shot |

Dependency graph:

```
schema  ←── compiler
   ↑
   ├── ai
   └── manual
```

`schema` has no runtime deps other than `zod`. The other three each depend on `schema` only.
