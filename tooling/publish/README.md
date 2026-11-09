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
      "name": "@halonicjs/integration-kit",
      "aliases": {},
      "dependencies": {
        "zod": "^4.6.7"
      },
      "peerDependencies": {}
    }
  }
}
```

`pnpm --filter @halonicjs/adapter-integration-kit build` writes the publishable copy to
`packages/adapters/integration-kit/dist/package`. Publish that folder, never the source package.

- `name`: the npm name, which may differ from the workspace name.
- `aliases`: workspace packages that are imports of another published package instead of bundled code
  (the conformance suite imports the published kit, so both share one set of error classes).
- `dependencies` and `peerDependencies`: the only outside packages the tarball may import. Staging fails on any other.
