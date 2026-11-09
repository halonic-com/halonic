# publish.packed-import

- Status: active
- Since: 0.1.0
- Source: HAL-1216 (build the integration kit and the conformance suite for npm)

The packed tarballs of the integration kit and the conformance suite shall install into a folder outside the workspace and import and type-check there with only their declared dependencies. The suite shall use the installed kit for the error classes and hold no copy of the kit's integration entry. An integration that imports the kit, bundled for a cloud runtime, shall pass `check:bundle`.

## Examples

- Given both tarballs installed into an empty folder with `zod` and `vitest`,
  when a module imports `@halonicjs/integration-kit` and `@halonicjs/testing-integration`,
  then `runTool`, `IntegrationTimeoutError` and `describeIntegrationConformance` are functions.
- Given code in that folder that assigns `maxIntegrationWaitMs` to a string,
  when it is type-checked,
  then the compiler reports the error, so the types are real and not `any`.
- Given an integration that imports `runTool` and `IntegrationRefusedError` from the installed kit,
  when it is bundled with a metafile,
  then `check:bundle --target cloudflare` passes on it.
