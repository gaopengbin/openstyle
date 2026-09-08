# Releasing OpenStyle

The initial 0.7 release is a GitHub **prerelease**, matching the project's alpha status. GitHub release assets are a distribution channel separate from npm publication. This workflow never runs `npm publish`, reads local npm credentials or claims that a package is available from the npm registry.

## Prepare the version

Update the eight public packages together: schema, adapter, compiler, manual, AI, cartography, OpenLayers and MapLibre. Use the repository's Changesets workflow and commit the resulting package versions, changelogs and lockfile. The tag must match their common version, for example `v0.7.0`.

Before tagging, merge reviewed changes with CI passing. Build packages before typechecking because downstream declarations use their built dependencies:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm docs:build
pnpm release:pack --version 0.7.0
```

Run `release:pack` through pnpm so `npm_execpath` points to the same pnpm CLI on Windows, macOS and Linux. The optional `--version` asserts the expected release; without it the script uses the shared package version. A mismatch or missing build fails before packing. It does not edit source manifests, publish packages, create tags or call a registry API.

Use `pnpm release:pack` for this GitHub distribution. The separate `pnpm release` command runs Changesets publication to npm; it is not an alias for the packaging workflow and is not part of this release's delivery.

## Distribution contents

The script writes `artifacts/releases/v0.7.0/` containing:

- Eight individual `.tgz` files, one for every public package.
- `SHA256SUMS` covering the eight tarballs and the bundle ZIP.
- `openstyle-0.7.0-bundle.zip` and its unpacked `bundle/` directory.

`pnpm pack` replaces `workspace:*` inside each packed manifest with the release version. The script inspects those manifests and refuses residual workspace references, absent internal packages or internal version mismatches. It will reuse identical local artifacts but will not overwrite different bytes at the same release path.

The bundle includes all eight tarballs, its own checksum manifest, installation instructions, and a private `package.json`. Every `@openstyle/*` dependency uses `file:./tarballs/...`; `pnpm.overrides` also maps every internal dependency to those local tarballs. Installing the bundle therefore does not require unpublished OpenStyle versions from npm.

This is offline **distribution of OpenStyle**, not a fully vendored dependency tree. Third-party dependencies and renderer peers, including zod, ol and maplibre-gl, still require registry access or a previously populated pnpm store. From the extracted bundle run `pnpm install`; `pnpm install --offline` is appropriate only when that external dependency cache is already available. Use pnpm for the provided overrides, and preserve the tarballs and overrides when adapting the bundle to another project.

Checksums can be verified with `sha256sum --check SHA256SUMS`, or with a SHA-256 tool on Windows. Never replace an already published tarball to correct a release; prepare a new version.

## Publish through GitHub Actions

After merging, push the intended version tag. `.github/workflows/release.yml` checks out that exact tag, installs with the frozen lockfile, builds, typechecks, runs tests, builds documentation and packages all eight artifacts. Manual dispatch accepts an **existing tag** to retry the same pipeline; it does not tag the current branch automatically.

The build job has read-only repository permission. Only the release job receives `contents: write`, using GitHub's workflow token. It verifies checksums, creates a prerelease and attaches all eight tarballs, the bundle ZIP and `SHA256SUMS`. It does not publish documentation to a hosting service.

Re-running the workflow is safe for identical artifacts: existing assets are downloaded and compared byte-for-byte; matching assets are skipped, missing assets are uploaded, and different assets cause failure. The workflow never uses `--clobber` or changes an existing asset. If a prior run stopped partway through upload, dispatch the same tag to fill the missing assets. Do not run a second manual release command while this workflow is responsible for the release.

The bundle ZIP uses fixed metadata and stores the already-compressed tarballs without an extra compression dependency. Reproducibility still depends on the tagged build and package contents; an upstream build producing different bytes is intentionally surfaced instead of overwritten.
