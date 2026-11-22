# connector-stdio-sandbox.call-timeout-cause

- Status: active
- Since: unreleased
- Source: HAL-15052, decided by Liam on HAL-14935: the Try it chat says that a connector timed out (D12), so a call that ran past `callTimeoutMs` throws the error the engine reads as `tool-timeout`

When the sandboxed stdio connector fails a tool call that took longer than the local tool's `callTimeoutMs` (`connector-stdio-sandbox.call-timeout`), it shall throw a `ConnectorToolTimeoutError` (`ports.connector-tool-timeout`) with the same message, the `callTimeoutMs` in `withinMs`, and its own deadline error as the `cause`.

## Examples

- Given a local tool with a `callTimeoutMs` of 50 whose call is never answered,
  when it is called,
  then the call throws a `ConnectorToolTimeoutError` with `withinMs` 50 and the message `Connector "notes"'s tool "read_note" didn't answer within 0.05 seconds, so Halonic stopped its program. The next call starts it again.`
