# format.workflow-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a workflow file, the format shall accept the old `Workflow` schema: states default to `task` with `on: []`, transitions to event `done`, timers like `30m`, `gets` of `input.*` or `context.*` only, guards of the eleven known shapes nested to any depth, and at most 16 for-each items at once. Rules between states are `@halonicjs/workflow`'s.

## Examples

- Given a state with only an agent and a transition `{ to: done }`, when it is parsed, then the state is a `task` and the transition's event is `done`.
- Given `when: { between: [1, 2] }`, when it is parsed, then it fails with `invalid_union` at the guard.
- Given `gets: [run.id]` and `after: '0m'`, when it is parsed, then it fails with `invalid_format` at both.
