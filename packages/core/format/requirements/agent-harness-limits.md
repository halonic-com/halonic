# format.agent-harness-limits

- Status: active
- Since: unreleased
- Source: HAL-12481, Liam's plan on the task (Halonic Code first slice, HAL-12473; gap found by HAL-11950)

When `parseFile` reads an agent file, the format shall accept an optional `harnessLimits` block with three optional fields, and leave the block out when the file does, so older files read as before:

- `maxSteps`: the most model calls the program makes in one step, a whole number from 1 to 10000.
- `maxMinutes`: the most minutes one step runs, a whole number from 1 to 1440.
- `maxCost`: the most one step may spend in the workspace budget's currency, a number above 0.

Any other field in the block, or a value outside those bounds, fails. The agent's own `maxSteps` keeps its meaning and default for Halonic's own loop.

## Examples

- Given an agent with only an id and a name, when it is parsed, then it has no `harnessLimits`, and its `maxSteps` is 6.
- Given `harnessLimits: { maxSteps: 150, maxMinutes: 20, maxCost: 2.5 }`, when it is parsed, then the block holds those three values.
- Given `harnessLimits: { maxMinutes: 20 }`, when it is parsed, then the block holds only `maxMinutes`.
- Given `maxSteps: 0`, `maxSteps: 10001`, `maxMinutes: 1.5`, `maxMinutes: 1441` or `maxCost: 0` in the block, when it is parsed, then it fails at that field.
- Given `harnessLimits: { maxTokens: 10 }`, when it is parsed, then it fails with `unrecognized_keys` at `harnessLimits`.
