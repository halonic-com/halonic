# publish.matching-versions

- Status: active
- Since: 0.1.0
- Source: HAL-1216 (build the integration kit and the conformance suite for npm)

The stager shall fail when a published dependency is not an exact version, or when a package imports a published package of ours (an alias) whose version differs from its own or that it doesn't pin to exactly that version, so the kit and the conformance suite always ship as one version.

## Examples

- Given the conformance suite at 0.1.0 that depends on `@halonicjs/integration-kit` "0.1.0", and the kit at 0.1.0,
  when it is staged,
  then staging succeeds.
- Given the suite at 0.2.0 and the kit at 0.1.0,
  when the suite is staged,
  then staging fails and names both versions.
- Given the suite depending on the kit "^0.1.0",
  when it is staged,
  then staging fails and asks for the exact version.
