# ports.chat-turn-tool-failure

- Status: active
- Since: unreleased
- Source: HAL-15052, decided by Liam on HAL-14935: a per-tool-call outcome with a cause, so the Try it chat can say that a connector timed out (D12); an optional output field keeps version 1

The `RunExecutor` port's `ChatTurnResponse` shall let an executor return, in an optional `toolFailures`, the calls to connectors' tools that failed for a reason a run would name, in the order they were made. Each shall name the call's `toolCallId`, the `reason`, which is only `tool-timeout` for now, the `tool` as its server lists it, the `connector`'s id, and `withinMs`, how long the connector waited. A response without `toolFailures` shall still satisfy the port.

## Examples

- Given a `ChatTurnResponse` without `toolFailures`,
  when it is compiled,
  then it compiles.
- Given a `ChatTurnToolFailure` whose reason is `model-timeout`,
  when it is compiled,
  then it doesn't compile.
- Given a `ChatTurnResponse` whose `toolFailures` holds `{ toolCallId: "c1", reason: "tool-timeout", tool: "search", connector: "handbook-files", withinMs: 60000 }`,
  when a chat reads it,
  then it gets the call, the tool, the connector and the time waited.
