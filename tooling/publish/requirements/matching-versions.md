# publish.matching-versions

- Status: active
- Since: 0.1.0
- Source: HAL-1216 (build the integration kit and the conformance suite for npm), HAL-5213 (one npm package per layer)

The stager shall fail when a layer package's dependency is not an exact version, or when it imports another layer package of ours whose version differs from its own, that no layer publishes, or that it doesn't pin to exactly that version, so `@halonicjs/adapters` and `@halonicjs/testing` always ship as one version.

## Examples

- Given `@halonicjs/testing` at 0.1.0 that depends on `@halonicjs/adapters` "0.1.0", and `@halonicjs/adapters` at 0.1.0,
  when it is staged,
  then staging succeeds.
- Given `@halonicjs/testing` at 0.2.0 and `@halonicjs/adapters` at 0.1.0,
  when `@halonicjs/testing` is staged,
  then staging fails and names both versions.
- Given `@halonicjs/testing` depending on `@halonicjs/adapters` "^0.1.0",
  when it is staged,
  then staging fails and asks for the exact version.
