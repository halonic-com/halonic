# events.agent-started-session

- Status: active
- Since: unreleased
- Source: HAL-17254, token phase 1e, with the harness usage of phase 1a (HAL-17250)

The events package shall let an `agent.started` event say, in an optional `session`, how the agent's harness session began: `{ start: "fresh", reason }`, where `reason` is a short code the harness bridge chose for why it didn't resume, or `{ start: "resumed" }`, so the share of fresh starts and their reasons can be counted. An `agent.started` without `session`, as Halonic's own loop and older logs have it, shall read as before.

## Examples

- Given an `agent.started` event with `session: { start: "fresh", reason: "no-session" }`,
  when its type is checked,
  then it is a valid run event.
- Given an `agent.started` event with `session: { start: "resumed" }`,
  when its type is checked,
  then it is a valid run event.
- Given an `agent.started` event without `session`,
  when its type is checked,
  then it is a valid run event.
