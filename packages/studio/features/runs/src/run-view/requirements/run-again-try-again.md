# runs.run-view.run-again-try-again

- Status: draft
- Since: unreleased
- Source: HAL-15067 (design check C533-1 of HAL-15056, on HAL-12412); `runs.run-view.run-again`, `shell.start-failure`; UX check rule E4 (HAL-12390)

When **Run again** doesn't start, the page shall announce "Couldn't start the run: *reason*" followed by the refusal's next step, when it has one. When the person presses the failure's **Try again**, it shall stay in place, busy, and keep focus until the start settles, and the failure shall stay on the page meanwhile. If that start fails too, focus shall move to the new failure, as the Run panel's does. Once a run has started, the failure shall go.

## Examples

- Given a failed real run and a host that refuses because Acme is already running in another Halonic, with the next step "Stop that one, then try again.",
  when **Run again** is pressed,
  then the page announces "Couldn't start the run: Acme is already running in another Halonic on this computer. Stop that one, then try again."
- Given that failure on the page,
  when the person presses **Try again** and the start is still pending,
  then **Try again** is still there with focus, busy, and the failure stays.
- Given that pending start,
  when the host refuses again,
  then focus is on the new failure.
