# workflow.validate-ignored-keys

- Status: active
- Since: unreleased
- Source: HAL-14302, from the C340 check on HAL-14271 (row 18, code row C38): keys a step's type doesn't use passed `halonic validate` silently

When `validateWorkflow` checks a state that sets a key its type doesn't use, the workflow rules shall warn once per such key, with code `ignored-key` at that key, naming the state, its type and the key, and saying what to do: for an agent on a wait or final step, to put the agent on a task step before it; for any other key, which step types use it. The keys each type uses shall be the ones the engine's handler for that type is given (`STATE_KEYS`), so the check and the engine can't disagree. The rules shall also warn, with the same code, about `with` on a step or a parallel branch without `method`, and about `continueOnError` on a parallel step with `join: any`. These are warnings, so a workflow that runs today still passes.

## Examples

- Given a wait step `review` with `agent` and `input`, when it is checked, then there are two warnings: `"review" is a wait step: agent is ignored. Put the agent on a task step before it.` at `states.review.agent`, and one for `input` at `states.review.input` that says only task, workflow and for-each steps use it.
- Given a task step with `items` and `concurrency`, when it is checked, then each is a warning that says only for-each steps use it.
- Given a task step with `with` and no `method`, and a parallel branch with `with` and no `method`, when it is checked, then each `with` is a warning that says to add the method or put the text in `input`.
- Given a parallel step with `join: any` and `continueOnError: true`, when it is checked, then `continueOnError` is a warning.
- Given a sound task, wait, workflow, parallel and for-each step that set only the keys their type uses, when they are checked, then there is no `ignored-key` warning.
