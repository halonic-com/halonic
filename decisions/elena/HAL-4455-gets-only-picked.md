# Decision: a step that picks data and has no input sends only the picked data

- Approval: found while porting the old gets tests on [HAL-4448](/HAL/issues/HAL-4448) and
  fixed on [HAL-4455](/HAL/issues/HAL-4455); the maintainer approves this note in review
- Kind: internal
- Task: HAL-4455

## What changes

`workflow.state-input` keeps its rule that a step with no `input` sends the run's input as JSON,
except for a step that picks data (`gets`): that step now sends only the `## Data` section, not
the run's input before it. One example is added for that case. `workflow.with-gets` gets one
sentence that points to the new case, and its rule for a step with a prompt is unchanged.

The engine's `task` states and `parallel` branches build their prompt through the new
`stepPrompt`, so both follow the rule. A `foreach` step with no `input` already sent only its item
and doesn't change.

## Why

The old engine (`engine.ts` at 784f78d) sent only the picked data: "a step that picks data and has
no input of its own sends only that, not the whole run input". The new engine sent the whole run
input first, so fields a step didn't pick reached the model, and in `examples/acme` the sorter got
the mail twice. A step lists what it picks so that the model sees only that.

## Tests

No test was weakened. New tests cover the rule in `stepPrompt`, in a `task` state and in a
`parallel` branch; both engine tests failed before the fix.

## Covers

- workflow.state-input
- workflow.with-gets
