# workflow.validate

- Status: active
- Since: 0.1.0
- Source: `validateWorkflow` in the old workflow package (`packages/core/workflow/src/validate.ts`) at 784f78d

When a workflow is checked before it runs, the workflow rules shall report, with the same codes and messages as the old checks, each of these problems: as errors, a missing initial state, a transition to a state that doesn't exist, a non-final state with no way out, a timer on a state that isn't a wait state, a for-each step without items or without exactly one of an agent and a workflow, a workflow step that names no workflow, a step that runs its own workflow, a parallel step without branches, and, when the caller lists them, an unknown agent or workflow; as warnings, an unreachable state, a final state with transitions, a task without an agent, a wait state that only listens to `done`, a transition hidden by an earlier unguarded one on the same event, and a workflow without a final state.

## Examples

- Given the triage workflow and the agents `classifier` and `support`, when it is checked, then there are no errors.
- Given a state that uses agent `ghost` and goes to `nowhere`, a state with no transitions and a state nothing reaches, when the workflow is checked with the agents `[x]`, then `unknown-target`, `unknown-agent`, `dead-end` and `unreachable` are reported.
- Given a workflow whose initial state `start` does not exist, when it is checked, then `Initial state "start" does not exist` is an error and reachability is not checked.
- Given a task with `after: 1h` and then two `done` transitions, the first without a guard, when it is checked, then the timer is an error and the third transition is a warning.
