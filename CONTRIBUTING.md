# Contributing to openstyle

Thanks for looking! openstyle is early alpha — the schema is still moving. Feedback is more valuable than PRs right now, but if you want to send code, here's the shape of things.

## Setup

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Requires Node ≥ 18.18 and pnpm ≥ 9.

## Repo layout

- `packages/schema` — canonical `StyleModel` type + zod schema. Any change here likely breaks downstream, so pair with a changeset explaining migration.
- `packages/compiler` — the deterministic SLD emitter. Prefer additive rules; keep XML output byte-identical for unchanged inputs (snapshot tests enforce this).
- `packages/manual` — Cookbook-distilled reference material. Prose contributions welcome.
- `packages/ai` — prompt builders and validators.
- `apps/docs` — VitePress documentation site.
- `skills` — Claude Code skills. Standalone.

## Making changes

1. Fork + branch.
2. Add tests. Snapshot tests are fine for compiler; unit tests for schema/validators.
3. `pnpm changeset` — describe the change, pick a semver bump for each affected package.
4. Open a PR against `main`.

## Style

- TypeScript strict mode, `noUncheckedIndexedAccess` on.
- Prefer named exports.
- No `default` exports in library packages.
- Comments explain *why*, not *what*. Reference the OGC / Cookbook section a rule comes from when relevant.

## Scope

- **In scope**: SLD 1.0 (short term), SLD 1.1 / SE 1.1 (later), Mapbox Style Spec (much later), QGIS QML (maybe).
- **Out of scope**: WMS transport, GeoServer REST API clients, map preview.

## License

By contributing you agree your changes are MIT licensed.
