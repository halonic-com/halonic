# format.knowledge-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a knowledge source file, the format shall accept the old `KnowledgeSource` schema: a required `provider`, `mode` `tools` or `auto`, an optional `writable`, and `config` `{}` by default.

## Examples

- Given `mode: auto` and `writable: true`, when it is parsed, then both are kept and `config` is `{}`.
- Given `mode: always`, when it is parsed, then it fails with `invalid_value` at `mode`.
- Given no `provider`, when it is parsed, then it fails with `invalid_type` at `provider`, line 1.
