# format.provider-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a provider file, the format shall accept the old `Provider` schema: a required `type`, which shall be one Halonic can call (anthropic, openai, openai-compatible, ollama, lmstudio or mock; any other fails with `provider-type` at `type`, naming the file and listing them), an optional `baseUrl` that must be a URL starting with http:// or https:// (any other fails with `provider-base-url` at `baseUrl`), a secret referenced by name, `local` false and `options` `{}` by default, and no other keys.

## Examples

- Given `id: mock` and `type: mock`, when it is parsed, then `local` is false and `options` is `{}`.
- Given `baseUrl: not a url`, when it is parsed, then it fails with `invalid_format` at `baseUrl`.
- Given `baseUrl: localhost:11434`, when it is parsed, then it fails with `provider-base-url` at `baseUrl`, saying it needs http:// or https://, such as http://localhost:11434.
- Given `id: mock` and `type: antropic`, when it is parsed, then it fails with `provider-type` at `type`, saying to set type in providers/mock.yaml to one of anthropic, openai, openai-compatible, ollama, lmstudio or mock.
- Given an `apiKey` key, when it is parsed, then it fails with `unrecognized_keys` naming `apiKey`.
