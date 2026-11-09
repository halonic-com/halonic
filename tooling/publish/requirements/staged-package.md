# publish.staged-package

- Status: active
- Since: 0.1.0
- Source: HAL-1190 (publish the integration kit and its conformance suite to npm)

The stager shall build the publishable copy of a workspace package into `dist/package`: the package's code and the code of every workspace package it imports, compiled to JavaScript and type declarations, with each import of a bundled workspace package turned into a relative path, and a manifest named by `halonic.publish.name`. It shall fail when the compiled code imports any package that `halonic.publish` does not declare, so a tarball never depends on an unpublished workspace package.

## Examples

- Given the integration kit, which imports `@halonicjs/ports` and `zod`,
  when it is staged,
  then no file in `dist/package` imports `@halonicjs/ports` and the manifest depends on `zod` only.
- Given a package that imports a workspace package listed in `halonic.publish.aliases`,
  when it is staged,
  then that import names the published package and the manifest depends on it.
- Given a package that imports `left-pad`, which its `halonic.publish` doesn't declare,
  when it is staged,
  then staging fails and names the file and the import.
