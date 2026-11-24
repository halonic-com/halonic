# events.harness-session-start

- Status: active
- Since: unreleased
- Source: HAL-17250 (token phase 1a, direction on HAL-16892, the board's yes on HAL-16897)

The events package shall let a `harness.started` event keep, in an optional `session`, how the step's harness session began: `start` is `fresh` or `resumed`, and `reason` says why. The only reason today is `no-resume`, because Halonic doesn't resume a harness session yet. The field is absent in logs written before it existed, which read as before.

## Examples

- Given a `harness.started` event with `session: { start: "fresh", reason: "no-resume" }`,
  when its type is checked,
  then it is a valid run event.
- Given a `harness.started` event without `session`,
  when its type is checked,
  then it is a valid run event, as before.
