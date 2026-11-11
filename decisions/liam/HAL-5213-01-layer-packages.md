# Decision: one npm package per layer, one subpath per piece

- Approval: the board said yes to one npm package per layer on [HAL-45](/HAL/issues/HAL-45) (11 Nov) and Liam planned it on [HAL-5213](/HAL/issues/HAL-5213); Priya reviewed the pull request on [HAL-5349](/HAL/issues/HAL-5349), then Liam signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:p5hKDXlJfYViAhql6OGHLNode8FBPQAyLT1pvxuI1Ubf0kf1rHQnjs/mdhhGvmAyKdg5ijRBC4GVxDd8oWGXDw==
- Task: HAL-5213

## What changes

`tooling/publish` stages one npm package per layer instead of one per workspace package. Each
layer is set up in `tooling/publish/layers/<layer>/layer.json` (name, version, dependencies), and
each workspace package of `packages/<layer>` whose `halonic.publish.name` names the layer becomes
one subpath of it. For 0.1.0 that is `@halonicjs/adapters/integration-kit` and
`@halonicjs/testing/integration`.

The requirements say the same in the new names:

- `publish.staged-package` builds a layer package with one subpath per workspace package, and
  fails on a package of another layer folder, two packages on one subpath or a layer with no
  subpaths. `halonic.publish.aliases` is gone: an import of an entry another layer publishes
  becomes that import path.
- `publish.matching-versions` and `publish.packed-import` name `@halonicjs/adapters` and
  `@halonicjs/testing` instead of the kit and the suite. What they require is unchanged.
- `integration-kit.integration-entry` names the entry `@halonicjs/adapter-integration-kit/integration`,
  published as `@halonicjs/adapters/integration-kit`. What it requires is unchanged.

`packages` in `tooling/check` requires `halonic.publish.name` to be `@halonicjs/<layer>/<folder>`,
or `@halonicjs/<layer>` for a layer's main entry. A package's workspace name comes from its folder
again, which undoes HAL-5145: an npm subpath can't be a workspace name. `policy.json` lists the kit
under `@halonicjs/adapter-integration-kit`.

`publish-kit.yml` compares the `version` in each `layer.json`, packs every layer in `dist/` and
publishes the two layer packages. The `layer.json` files are new on `main`, so merging publishes
nothing; a new layer package is first staged by a run by hand.

## Why

The board chose one npm package per layer, so integration authors see a few stable packages
instead of one for every piece inside a layer, and the folders inside the repo stay as they are.

## Covers

- integration-kit.integration-entry
- publish.matching-versions
- publish.packed-import
- publish.staged-package
- .github/
- tooling/check/
