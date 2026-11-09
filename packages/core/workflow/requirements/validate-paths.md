# workflow.validate-paths

- Status: active
- Since: 0.1.0
- Source: HAL-1926 (for HAL-1523, HAL-186 implementation plan step 1b)

When `validateWorkflow` reports an issue, the workflow rules shall give the key path in the workflow file of what the issue is about: `initial` for a missing initial state; the transition's `to` for an unknown target, its `after` for a timer outside a wait state, and the transition itself for one an earlier unguarded transition hides; the `gets` entry for unknown picked data; the state's `on` for a final state with transitions; the state's `agent`, the branch's `agent` or the state's `workflow` for an unknown agent or workflow and for a step that runs its own workflow; the state itself for an unreachable state and for what a state lacks; and the whole file for a workflow without a final state.

## Examples

- Given a workflow whose initial state `start` does not exist, when it is checked, then the error is at `initial` and the missing final state is at the whole file.
- Given a state `s` whose second transition goes to `nowhere`, when it is checked, then the error is at `states.s.on.1.to`.
- Given a state `s` that picks `input.x` and `context.nope`, when it is checked, then the error is at `states.s.gets.1`.
- Given a state `s` with a timer on its first transition and two unguarded `done` transitions after it, when it is checked, then the timer is at `states.s.on.0.after` and the hidden transition at `states.s.on.2`.
- Given a parallel step `named` whose branch `one` uses the unknown agent `ghost`, when it is checked, then the error is at `states.named.branches.one.agent`.
