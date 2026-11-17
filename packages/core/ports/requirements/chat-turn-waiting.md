# ports.chat-turn-waiting

- Status: active
- Since: unreleased
- Source: HAL-850 section 3 and HAL-2212, approved on HAL-2212: waiting for approval isn't a refusal, so it has its own field; an optional output field keeps version 1

The `RunExecutor` port's `ChatTurnResponse` shall let an executor return, in an optional `waiting`, the listed tools the turn left out because no person approved them yet, in listing order, each with the `source` (the connector's id) and the tool's `name` as its server lists it, cut to 64 characters and escaped. `waiting` shall not be part of `refusals` and shall never go to the model. A response without `waiting` shall still satisfy the port.

## Examples

- Given a `ChatTurnResponse` without `waiting`,
  when it is compiled,
  then it compiles.
- Given a `ChatTurnResponse` whose `waiting` holds `{ source: "notes", name: "lookup" }`,
  when a status view reads it,
  then it gets the connector's id and the tool's name, apart from the refusals.
- Given a `ChatTurnWaiting` with a `reason`,
  when it is compiled,
  then it doesn't compile.
