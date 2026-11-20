# workflow.validate-wait-signal

- Status: active
- Since: unreleased
- Source: HAL-14310, PR 1 of the signal-routine plan on HAL-14305

If a `wait` step has a `signal`, then the workflow rules shall report the error `wait-with-signal` at the step's `signal` key, with the message `Wait step "<step>" can't send a signal. Put signal: on the step after it.` A wait step has no moment to send one, so the engine never would, and a routine on that signal would never start.

## Examples

- Given a wait step `check` with `signal: { name: review.done }`,
  when the workspace is checked,
  then `halonic validate` reports `✕ Wait step "check" can't send a signal. Put signal: on the step after it.  (wait-with-signal)` at the line of its signal and exits 1.
- Given the same signal on the task step after the wait, or on the final step,
  when the workflow is checked,
  then there is no `wait-with-signal` issue.
