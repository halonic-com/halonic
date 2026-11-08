# format.runtime-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a runtime file, the format shall accept the old `Runtime` schema: an id, a required `type`, `options` `{}` by default, and version 1 only.

## Examples

- Given `id: inprocess` and `type: inprocess`, when it is parsed, then `options` is `{}`.
- Given `options: fast`, when it is parsed, then it fails with `invalid_type` at `options`.
- Given `version: 2`, when it is parsed, then it fails with `invalid_value` at `version`.
