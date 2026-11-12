# Decision: the integration runner may build with esbuild

- Approval: widening a library's `allowedIn` in `tooling/check/dependencies.json` needs Liam's review (AGENTS.md, docs/guides/dependencies.md); Liam approves this note in review of the runner file PR on HAL-983
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jOlh4C60Qyz43x5UbOSpMeaJzD5P8Au+5W5W3gY5z10L7HNcFvEyCOJw7f3HZbzjUAhnL6jh5ek/71eyFvhjAQ==
- Task: HAL-983

## What changes

The `esbuild` entry in `tooling/check/dependencies.json` also allows
`@halonicjs/adapter-integration-runner`, in the `adapters` layer. It stays `dev-tooling`: the
package lists it under `devDependencies`, and its `build` script uses it to write
`dist/runner.mjs`. No new library: esbuild is already in the lockfile, at the catalog version.

## Why

Inside its fence, the runner's Node reads only the runner file and the integration's folder
(design HAL-958, sections 1 b and 7). The runner imports our packages and Zod, 213 files in
all, so it has to be built into one file. The options were:

- **esbuild, already approved for `tooling-publish`:** a few lines, and the build checks from
  esbuild's metafile that the file imports only `node:` modules. It never ships; only the file
  it writes does, which holds our code and Zod.
- **A bundler of our own:** linking 213 ES modules (re-exports, `export *`, cycles, Zod's
  internals) by hand is a lot of code to get right, for no gain over a tool we already trust.
- **No bundle, allowing Node to read every file of the runner's import tree:** about 213
  paths in both the `Sandbox` profile and Node's `--allow-fs-read`, and the published package
  layout would decide what the fence allows. The design approved one file.

## Covers

- tooling/check/
