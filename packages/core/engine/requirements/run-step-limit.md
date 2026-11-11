# engine.run-step-limit

- Status: active
- Since: 0.1.0
- Source: HAL-5214, findings of the 11 Nov code review

When a run's model call reaches its agent's `maxSteps` (6 without its file) while the model still calls tools, the engine shall fail the call with the error `Agent "<agent>" used all <n> of its steps (maxSteps) and was still calling tools, so it gave no answer.`, so a task state fails the run, and a `parallel` branch ends with that error, instead of going on with an unfinished answer as the state's output.

## Examples

- Given a reply workflow whose `writer` has `maxSteps: 2`, and a model that calls `lookup` every time,
  when the run's model call runs,
  then the model is asked twice, and the run fails with `reason: "error"` and that error, and `reply` isn't set.
