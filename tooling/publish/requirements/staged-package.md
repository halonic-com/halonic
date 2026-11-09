# publish.staged-package

- Status: active
- Since: 0.1.0
- Source: HAL-1190 (publish the integration kit and its conformance suite to npm)

The stager shall build the publishable copy of a workspace package into `dist/package`: the package's `halonic.publish.entry` (default `.`) and the code of every workspace package it imports, compiled to JavaScript and type declarations, with each import of a bundled workspace package turned into a relative path, each import of an entry in `halonic.publish.aliases` turned into the published name and that entry's files left out, and a manifest named by `halonic.publish.name` whose `repository` names the package's folder. It shall fail when the compiled code imports any package that `halonic.publish` does not declare, so a tarball never depends on an unpublished workspace package, and when an aliased entry shares its folder with another entry of its package, so leaving it out never removes more than that entry.

## Examples

- Given the integration kit, whose published entry is `./integration` and imports `@halonicjs/ports`,
  when it is staged,
  then no file in `dist/package` imports `@halonicjs/ports`, the loader isn't in it and the manifest has no dependencies.
- Given the conformance suite, which bundles the kit's host side and lists the kit's `./integration` entry in `halonic.publish.aliases`,
  when it is staged,
  then the host side imports the error classes from `@halonicjs/integration-kit`, no copy of the integration entry is in it and the manifest depends on the kit.
- Given a package that imports `left-pad`, which its `halonic.publish` doesn't declare,
  when it is staged,
  then staging fails and names the file and the import.
- Given an alias of a package's root entry `src/index.ts`, while its `./integration` entry lives in `src/integration`,
  when the package is staged,
  then staging fails and names `./integration`, instead of leaving all of `src` out.
