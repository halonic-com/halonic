# engine.run-step-limit

- Status: active
- Since: unreleased
- Source: HAL-5214, findings of the 11 Nov code review; HAL-15331 (model call words and the cause)

When a run's model call reaches its agent's `maxSteps` (6 without its file) while the model still calls tools, the engine shall fail the call with the error `Agent "<agent>" used all <n> of its model calls (maxSteps) and was still calling tools, so it gave no answer.` (`used its only model call` for a limit of 1), of kind `limit_reached`, with the cause code `engine.turn-limit` and the detail `agent` and `turns` (the limit), so a task state fails the run, and a `parallel` branch ends with that error, instead of going on with an unfinished answer as the state's output.

## Examples

- Given a reply workflow whose `writer` has `maxSteps: 2`, and a model that calls `lookup` every time,
  when the run's model call runs,
  then the model is asked twice, and the run fails with `reason: "error"`, that error and the cause `engine.turn-limit` with `agent: "writer"` and `turns: "2"`, and `reply` isn't set.
