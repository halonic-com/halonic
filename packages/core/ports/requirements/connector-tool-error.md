# ports.connector-tool-error

- Status: active
- Since: unreleased
- Source: HAL-12342 (a tool that answered with an error is not a call that broke off, decided by Liam on the task); Julian's docs check on HAL-12334

The ports package shall give connector adapters one error, `ConnectorToolError`, to say that a tool answered with an error of its own (MCP's `isError`), with Halonic's message naming the connector and the tool, and the tool's own text kept apart in `toolText`. It shall give an `isConnectorToolError(value)` check that tells it apart by its `name` and a string `toolText`, without `instanceof`, so it works when an adapter has its own copy of the package. A call that got no answer at all shall throw any other error, so the engine can tell a failed call from one that broke off.

## Examples

- Given `new ConnectorToolError("handbook-files", "read_text_file", "ENOENT: no such file or directory")`,
  when it is checked with `isConnectorToolError`,
  then it passes, its message is `Connector "handbook-files" says its tool "read_text_file" failed.` and its `toolText` is the tool's text.
- Given an `Error` from another copy of the package, named `ConnectorToolError` with a `toolText` string,
  when it is checked with `isConnectorToolError`,
  then it passes.
- Given a plain `Error`, an `Error` named `ConnectorToolError` without a `toolText` string, or an object that only looks like one,
  when it is checked with `isConnectorToolError`,
  then it fails.
