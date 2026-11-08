# format.workflow-test-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a workflow test file, the format shall accept the old `WorkflowTest` schema: at least one case, each with empty input, mocks, events, tools and expect by default, and events that are a name, `{ advance: <duration> }` or `{ event, payload }`.

## Examples

- Given one case with only a name, when it is parsed, then its other keys are filled in empty.
- Given `cases: []`, when it is parsed, then it fails with `too_small` at `cases`.
- Given `expect: { status: paused }`, when it is parsed, then it fails with `invalid_value` at the status.
