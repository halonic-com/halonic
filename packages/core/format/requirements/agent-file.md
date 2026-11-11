# format.agent-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`; agent id limits: HAL-6456

When `parseFile` reads an agent file, the format shall accept the old `Agent` schema with every default (empty lists, `instructions: ""`, `output: { type: text }`, `maxSteps: 6`, `runLogs: false`), method ids that are ids, methods with required instructions and a `text` or typed-fields output, a `choice` output with at least one option, and a character whose colours are `#RRGGBB`. It shall refuse an agent id over 64 characters or named after a Windows device (`con`, `prn`, `aux`, `nul`, `com0`–`com9`, `lpt0`–`lpt9`) with a message that says which rule it breaks, as `format.deployments-file` does for deployment ids. An agent id names the agent's harness settings folder in the profile (`profile.harness-settings-folder`), so it must be a folder name on every system and accept exactly the ids the profile accepts; the old schema allowed any length and the device names.

## Examples

- Given only an id and a name, when it is parsed, then every default is filled in.
- Given `output: { type: choice, options: [] }`, when it is parsed, then it fails with `too_small` at `output.options`.
- Given a method `Extract`, a colour `blue` and `maxSteps: 201`, when it is parsed, then it fails with `invalid_key`, `invalid_format` and `too_big` at their paths.
- Given an agent id of 64 characters, when it is parsed, then it is accepted.
- Given an agent id of 65 characters, when it is parsed, then it fails with `too_big` at `id`, and the message says to use at most 64 characters.
- Given an agent id `aux` (or `con`, `nul`, `com1`, …), when it is parsed, then it fails with `invalid_format` at `id`, and the message says Windows keeps the name for a device. `console`, `com10` and `nul-1` are accepted.
- Given any id, when an agent file and the profile's harness settings folder are given it, then both accept it or both refuse it.
