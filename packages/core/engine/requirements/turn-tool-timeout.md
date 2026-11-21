# engine.turn-tool-timeout

- Status: active
- Since: unreleased
- Source: HAL-15052, decided by Liam on HAL-14935: the Try it chat says that a connector timed out (D12), so the turn reports which call ran out of time

If a connector's tool that the engine runs in a model turn throws a `ConnectorToolTimeoutError`, then the engine shall give the model the error as the call's result and go on with the turn, as for any tool that throws, and shall also add a `tool-timeout` entry to the turn's `toolFailures` that names the call's id, the tool as its server lists it, the connector's id and how long the connector waited. A tool that throws any other error, and one of Halonic's own tools, shall add no entry.

## Examples

- Given the connector `handbook-files`, whose tool `search` throws a `ConnectorToolTimeoutError` after 60 seconds,
  when the model calls it as `c1`,
  then the model gets "The tool search failed: …" as its result, the turn goes on to the model's next answer, and `toolFailures` holds `{ toolCallId: "c1", reason: "tool-timeout", tool: "search", connector: "handbook-files", withinMs: 60000 }`.
- Given a connector's tool that throws a plain error, or one of Halonic's own tools that throws a `ConnectorToolTimeoutError`,
  when the model calls it,
  then `toolFailures` is empty.
