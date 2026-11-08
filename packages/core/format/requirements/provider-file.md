# format.provider-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a provider file, the format shall accept the old `Provider` schema: a required `type`, an optional `baseUrl` that must be a URL, a secret referenced by name, `local` false and `options` `{}` by default, and no other keys.

## Examples

- Given `id: mock` and `type: mock`, when it is parsed, then `local` is false and `options` is `{}`.
- Given `baseUrl: not a url`, when it is parsed, then it fails with `invalid_format` at `baseUrl`.
- Given an `apiKey` key, when it is parsed, then it fails with `unrecognized_keys` naming `apiKey`.
