# @halonicjs/tooling-publish

Builds the npm tarballs of the packages we publish. It compiles a workspace package together with the
workspace code it imports, so the tarball needs no unpublished `@halonicjs/*` package.

- **Layer:** tooling
- **Owner:** mateo
- **Public API:** `@halonicjs/tooling-publish`

## Example

A package opts in with `halonic.publish` in its `package.json` and a `build` script:

```json
{
  "scripts": {
    "build": "node ../../../tooling/publish/src/cli/stage.ts ."
  },
  "halonic": {
    "publish": {
      "name": "@halonicjs/testing-integration",
      "entry": ".",
      "aliases": {
        "@halonicjs/adapter-integration-kit/integration": "@halonicjs/integration-kit"
      },
      "dependencies": {
        "@halonicjs/integration-kit": "0.1.0",
        "zod": "4.6.7"
      },
      "peerDependencies": {
        "vitest": "^5.1.0"
      }
    }
  }
}
```

`pnpm --filter @halonicjs/testing-integration build` writes the publishable copy to
`packages/testing/integration/dist/package`. Publish that folder, never the source package.

- `name`: the npm name, which may differ from the workspace name.
- `entry`: the subpath of the package's `exports` that is published (default `.`). The kit publishes
  only `./integration`, so integrations carry none of the host side.
- `description`: the npm description, when the workspace one doesn't fit the published entry.
- `readme`: the README shipped to npm, relative to the package (default `README.md`). The kit ships
  `README.npm.md`, because its workspace README describes the host side, which isn't published.
- `aliases`: workspace entries that stay imports of another published package instead of bundled code.
  The conformance suite bundles the kit's host side but imports `./integration` from the published kit,
  so both share one set of error classes. The aliased entry's folder is left out of the tarball, so it
  may hold no other entry of its package: an alias of a root entry (`src/index.ts`) fails.
- `dependencies` and `peerDependencies`: the only outside packages the tarball may import. Staging fails on
  any other. Dependencies are exact versions.

Staging also fails unless every aliased package of ours has the same version as this one and is pinned
to exactly that version, so the kit and the suite always ship together.

## Releasing

[`publish-kit.yml`](../../.github/workflows/publish-kit.yml) publishes every version that isn't on npm
yet, whenever a push to `main` changes `packages/adapters/integration-kit/package.json` or
`packages/testing/integration/package.json`. So a pull request that changes either file is a release,
and so is a run by hand with `dry_run` off. Releases need the board's yes: ask through a task for
Chief, and merge or run only once the user has approved.

## Tests

`src/pack.test.ts` packs both packages, installs the tarballs into a folder outside the workspace,
imports and type-checks them there, and bundles a small integration against the kit with esbuild so
`check:bundle` can check it. It needs no network: `zod` and `vitest` are linked from the workspace.
