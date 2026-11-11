# @halonicjs/tooling-publish

Builds the npm tarballs of the packages we publish: one npm package per layer (HAL-5149), such as
`@halonicjs/adapters`, with one subpath per workspace package it publishes, such as
`@halonicjs/adapters/integration-kit`. It compiles each published entry together with the workspace code it
imports, so the tarball needs no unpublished `@halonicjs/*` package. Inside the repo nothing changes: the
small workspace packages stay private and keep their own names.

- **Layer:** tooling
- **Owner:** mateo
- **Public API:** `@halonicjs/tooling-publish` (`stageLayer`, `rewriteSpecifiers`)
- **Requirements:** `publish.staged-package`, `publish.matching-versions`, `publish.packed-import`

## Example

A layer package is a folder under [`layers/`](layers), named after its layer folder in `packages/`. It
holds a `layer.json` and the `README.md` shipped to npm:

```json
{
  "name": "@halonicjs/testing",
  "version": "0.1.0",
  "description": "Halonic's test suites for code outside the engine.",
  "dependencies": {
    "@halonicjs/adapters": "0.1.0",
    "zod": "4.6.7"
  },
  "peerDependencies": {
    "vitest": "^5.1.0"
  }
}
```

A workspace package of that layer becomes one subpath with `halonic.publish` in its `package.json`:

```json
{
  "name": "@halonicjs/adapter-integration-kit",
  "halonic": {
    "publish": {
      "name": "@halonicjs/adapters/integration-kit",
      "entry": "./integration"
    }
  }
}
```

`pnpm --filter @halonicjs/tooling-publish run stage` writes the publishable copy of every layer package to
`tooling/publish/dist/<layer>`; `run stage adapters` stages one. Publish that folder, never a source package.

- `layer.json` `name` and `version`: the npm name and the one version of the whole layer package.
- `layer.json` `description`: the npm description.
- `layer.json` `dependencies` and `peerDependencies`: the only outside packages the tarball may import.
  Staging fails on any other. Dependencies are exact versions.
- `halonic.publish.name`: the import path on npm, the layer package's name with a subpath (or without one
  for its main entry). Only packages in the layer's own folder may name it, and only one per subpath.
- `halonic.publish.entry`: the subpath of the package's `exports` that is published (default `.`). The kit
  publishes only `./integration`, so integrations carry none of the host side.

An import of an entry another layer package publishes stays an import of that package instead of bundled
code. The conformance suite bundles the kit's host side but imports `@halonicjs/adapters/integration-kit`,
so both share one set of error classes. That entry's folder is left out of the tarball, so it may hold no
other entry of its package: publishing a root entry (`src/index.ts`) this way fails. Staging also fails
unless every layer package of ours it imports has the same version and is pinned to exactly that version,
so the adapters and the testing package always ship together.

Only subpaths we are ready to keep stable are published: adding `halonic.publish` to a package adds it to
the public API of its layer package and needs Liam's review.

## Releasing

[`publish-kit.yml`](../../.github/workflows/publish-kit.yml) publishes every version that isn't on npm
yet, whenever a push to `main` changes a `layers/*/layer.json`. So a pull request that changes the
`version` in one is a release, and so is a run by hand with `dry_run` off (it is on by default, and then
the run builds and checks the tarballs and stops short of `npm publish`).
npm trusts the workflow's own identity, so no token exists, and the run only
_stages_ the version: it isn't public until a person approves it on npmjs.com.
Releases need the board's yes: ask through a task for
Chief, and merge or run only once the user has approved.

## Tests

`src/pack.test.ts` packs both layer packages, installs the tarballs into a folder outside the workspace,
imports and type-checks them there, and bundles a small integration against the kit with esbuild so
`check:bundle` can check it. It needs no network: `zod` and `vitest` are linked from the workspace.
