# ports.connector-tool-timeout

- Status: active
- Since: unreleased
- Source: HAL-15052, decided by Liam on HAL-14935: the Try it chat says that a connector timed out (D12), so a tool call that ran out of time needs a cause

The ports package shall give connector adapters one error, `ConnectorToolTimeoutError`, to say that a tool didn't answer within the time its connector allows a call, with Halonic's message, the time waited in milliseconds in `withinMs`, and the connector's own error as its `cause` when the adapter gives one. It shall give an `isConnectorToolTimeout(value)` check that tells it apart by its `name` and a positive, finite `withinMs`, without `instanceof`, so it works when an adapter has its own copy of the package. It shall not pass `isConnectorToolError`, because the tool gave no answer.

## Examples

- Given `new ConnectorToolTimeoutError("The tool \"search\" didn't answer within 60 seconds.", 60_000)`,
  when it is checked with `isConnectorToolTimeout`,
  then it passes, keeps that message, and its `withinMs` is 60000; `isConnectorToolError` fails.
- Given the error made with the connector's own error as its `cause`,
  when it is read,
  then its `cause` is that error.
- Given an `Error` from another copy of the package, named `ConnectorToolTimeoutError` with a `withinMs` of 30000,
  when it is checked with `isConnectorToolTimeout`,
  then it passes.
- Given a plain `Error`, an `Error` with that name whose `withinMs` is missing, zero, infinite or a string, or an object that only looks like one,
  when it is checked with `isConnectorToolTimeout`,
  then it fails.
