# publish.staged-package

- Status: active
- Since: 0.1.0
- Source: HAL-1190 (publish the integration kit and its conformance suite to npm), HAL-5213 (one npm package per layer)

The stager shall build one npm package per layer (`@halonicjs/adapters`, `@halonicjs/testing`) from `tooling/publish/layers/<layer>/layer.json` into `tooling/publish/dist/<layer>`. Each workspace package of `packages/<layer>` whose `halonic.publish.name` names the layer package becomes one subpath of it: its `halonic.publish.entry` (default `.`) and the code of every workspace package it imports, compiled to JavaScript and type declarations, with each import of a bundled workspace package turned into a relative path, each import of an entry another layer package publishes turned into that import path and that entry's files left out, and a manifest named and versioned by `layer.json` whose `exports` hold one subpath per package. It shall fail when the compiled code imports any package that `layer.json` does not declare, so a tarball never depends on an unpublished workspace package; when a package of another layer folder names the layer package, or two packages name one subpath; when the layer package has no subpaths; and when a published entry shares its folder with another entry of its package, so leaving it out never removes more than that entry.

## Examples

- Given the integration kit, published as `@halonicjs/adapters/integration-kit` from its `./integration` entry, which imports `@halonicjs/ports`,
  when `@halonicjs/adapters` is staged,
  then its only subpath is `./integration-kit`, no file imports `@halonicjs/ports`, the loader isn't in it and the manifest has no dependencies.
- Given the conformance suite, published as `@halonicjs/testing/integration`, which bundles the kit's host side and imports the kit's `./integration` entry,
  when `@halonicjs/testing` is staged,
  then the host side imports the error classes from `@halonicjs/adapters/integration-kit`, no copy of the integration entry is in it and the manifest depends on `@halonicjs/adapters`.
- Given a package of `packages/core` that names `@halonicjs/adapters`, or two packages that name one subpath,
  when the layer package is staged,
  then staging fails and names the packages.
- Given a package that imports `left-pad`, which its layer's `layer.json` doesn't declare,
  when it is staged,
  then staging fails and names the file and the import.
- Given a published root entry `src/index.ts`, while its `./integration` entry lives in `src/integration`,
  when the package is staged,
  then staging fails and names `./integration`, instead of leaving all of `src` out.
