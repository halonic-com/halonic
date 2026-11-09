# ports.send-call-id

- Status: active
- Since: 0.1.0
- Source: HAL-186 implementation plan, E5 and decision 3 (HAL-1515): approvals are routed by `callId`, an input executors must honor, so it is in `RunExecutor` version 1 before the freeze

The `RunExecutor.send` method shall take a named `SendOptions` as an optional fourth argument, whose optional `callId` names the tool call the event is meant for.

The rule every executor follows with it, refusing an event for a call the run doesn't wait on, is in `contracts.run-executor-send`.

## Examples

- Given `RunExecutor.send`,
  when it is called with `{ callId: "call-1" }` as a fourth argument,
  then it compiles.
- Given `RunExecutor.send`,
  when it is called with three arguments,
  then it compiles, so callers that don't name a call are unchanged.
- Given `SendOptions` with a `callId` that isn't a string,
  when it is compiled,
  then it doesn't compile.
