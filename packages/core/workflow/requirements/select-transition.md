# workflow.select-transition

- Status: active
- Since: 0.1.0
- Source: `selectTransition` and `getState` in the old workflow package (`packages/core/workflow/src/machine.ts`) at 784f78d

When an event arrives in a state, the workflow rules shall fire the first transition of that state, in file order, whose event matches and whose guard passes, and no transition when none does. A timer transition shall never fire on an event. If the state does not exist in the workflow, then the rules shall refuse with an error that names the workflow and the state.

## Examples

- Given the triage workflow and the context `category: question`, when `done` arrives in `classify`, then the transition to `answer` fires.
- Given the context `category: bug`, when `done` arrives in `classify`, then the unguarded transition to `review` fires.
- Given the wait state `review`, when `done` arrives, then nothing fires, because `review` only listens to `approve` and `reject`.
- Given a wait state with `after: 1h` and no event, when `done` arrives, then nothing fires.
