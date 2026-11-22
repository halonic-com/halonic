# workflow.validate-wait-arrow-event

- Status: active
- Since: unreleased
- Source: HAL-15590, from the flow check C596 #4 on HAL-15586

If a `wait` step has a transition on a named event (one with an `event` other than `done` and no timer), then the workflow rules shall report the warning `wait-arrow-without-event` for each of its other transitions that has no `event` (or `event: done`) and no timer, at that transition, with the message `In "<step>", the transition to "<target>" has no event, so a person must answer "done" to take it. Name the answer it is for, like "reject", or give it a timer`. A wait never ends with `done`, so such a transition is taken only when someone answers `done`; next to named answers it is most likely a missing `event`. A wait whose transitions, timers aside, are all on `done` gets `wait-without-events` instead, once for the step, since a timer is not an answer a person can pick; a wait with only timers gets neither.

## Examples

- Given the wait step `check` with transitions on `approve` and `reject` and a third, `- to: draft`, without an event,
  when it is checked,
  then the warning is `In "check", the transition to "draft" has no event, so a person must answer "done" to take it. Name the answer it is for, like "reject", or give it a timer` at `states.check.on.2`, and there is no `wait-without-events` warning.
- Given a wait step with a transition on `approve` and a plain `after: 1h` timer,
  when it is checked,
  then there is no `wait-arrow-without-event` warning.
- Given a wait step whose only transition has no event,
  when it is checked,
  then there is a `wait-without-events` warning and no `wait-arrow-without-event` warning.
- Given a wait step with a plain `after: 1h` timer and a transition without an event,
  when it is checked,
  then there is a `wait-without-events` warning and no `wait-arrow-without-event` warning.
- Given a wait step whose only transition is a plain `after: 1h` timer,
  when it is checked,
  then there is no `wait-without-events` warning.
- Given a task step with a transition on `finished` and one without an event,
  when it is checked,
  then there is no `wait-arrow-without-event` warning.
