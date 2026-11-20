# workflow.validate-done-transition

- Status: active
- Since: 0.1.0
- Source: HAL-14303, from Nina's check of a fresh project (C340 C36, HAL-14271)

If a step that isn't a wait step or a final step has transitions, and none of those without a timer takes the event `done`, then the workflow rules shall report the error `no-done-transition` at the first one's `event`, because the step ends with `done` and the engine fails the run when no transition takes it. The message is `"<step>" ends with the event done, but its transitions only take <events>. Remove event: <event>, or add a transition without event.`, with the events as `a`, `a or b` or `a, b or c`, and `Remove their event` instead of `Remove event: <event>` when there are two or more.

## Examples

- Given the task step `draft` with `on: [{ to: review, event: finished }]`, when it is checked, then the error is `"draft" ends with the event done, but its transitions only take finished. Remove event: finished, or add a transition without event.` at `states.draft.on.0.event`.
- Given a for-each step with transitions on `approve` and `reject`, when it is checked, then the error says `only take approve or reject. Remove their event, or add a transition without event.`
- Given a wait step with transitions on `approve` only, or a task step with one transition on `finished` and one without event, when it is checked, then there is no `no-done-transition` error.
