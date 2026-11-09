# engine.final-state

- Status: active
- Since: 0.1.0
- Source: HAL-1526, step 3(a) of the HAL-186 plan

When a run enters a `final` state, the engine shall complete the run with `run.completed`, carrying the workflow's initial context with every value the run wrote laid over it.

## Examples

- Given a workflow with the initial context `{ tone: "friendly" }` and a run that wrote `reply`,
  when the run enters the final state `sent`,
  then it completes with the context `{ tone: "friendly", reply: "On its way" }`.
