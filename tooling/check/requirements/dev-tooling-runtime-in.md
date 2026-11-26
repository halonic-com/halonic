# check.dev-tooling-runtime-in

- Status: active
- Since: unreleased
- Source: HAL-17568

When a package lists a `dev-tooling` library in `dependencies`, or imports it from a source file that isn't a test or config file, `pnpm check` shall pass it only if that library's `dependencies.json` entry names that package in `runtimeIn`. It shall fail an entry whose `runtimeIn` is set on a library that isn't dev tooling, or names anything other than exactly one `@halonicjs/adapter-<name>` that `allowedIn` also names, with `adapters` in `layers`.

## Examples

- Given `@typescript/typescript6` with `"runtimeIn": "@halonicjs/adapter-toolscript-check"`,
  when that adapter lists it in `dependencies` and imports it from `src/`,
  then the check passes it, and fails any other package that lists it there.
- Given a dev-tooling entry with `"runtimeIn": "@halonicjs/adapter-*"`,
  when the check runs,
  then it fails the entry in `tooling/check/dependencies.json`.
