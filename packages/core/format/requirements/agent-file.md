# format.agent-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads an agent file, the format shall accept the old `Agent` schema with every default (empty lists, `instructions: ""`, `output: { type: text }`, `maxSteps: 6`, `runLogs: false`), method ids that are ids, methods with required instructions and a `text` or typed-fields output, a `choice` output with at least one option, and a character whose colours are `#RRGGBB`.

## Examples

- Given only an id and a name, when it is parsed, then every default is filled in.
- Given `output: { type: choice, options: [] }`, when it is parsed, then it fails with `too_small` at `output.options`.
- Given a method `Extract`, a colour `blue` and `maxSteps: 201`, when it is parsed, then it fails with `invalid_key`, `invalid_format` and `too_big` at their paths.
