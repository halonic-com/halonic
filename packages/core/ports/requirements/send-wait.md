# ports.send-wait

- Status: active
- Since: unreleased
- Source: HAL-11240; `RunExecutor` port v2 (see the ADR "A send can name the wait step it answers")

The `RunExecutor.send` method shall take in its `SendOptions` an optional `wait`, with the `state` of the wait step the event is meant for and the time it started waiting (`since`, the run summary's `lastWaitingAt`).

The rule every executor follows with it, refusing an event for a step the run doesn't wait at, is in `contracts.run-executor-send`.

## Examples

- Given `RunExecutor.send`,
  when it is called with `{ wait: { state: "review", since: "2026-11-10T10:40:00.000Z" } }` as a fourth argument,
  then it compiles.
- Given `SendOptions` with a `wait` that has no `since`,
  when it is compiled,
  then it doesn't compile.
