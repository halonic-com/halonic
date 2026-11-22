# mcp.tool-call-timeout

- Status: active
- Since: unreleased
- Source: HAL-15052, decided by Liam on HAL-14935: the Try it chat says that a connector timed out (D12), so a connector's tool call that ran out of time throws the error the engine reads as `tool-timeout`

When the stdio or HTTP transport gives up on a request because the server didn't answer within its request timeout, its error shall carry that time in `timeoutMs`. If that request was a tool call, the stdio and HTTP connectors shall throw a `ConnectorToolTimeoutError` (`ports.connector-tool-timeout`) that names the connector, the tool and the seconds waited, with the time in `withinMs` and the transport's error as its `cause`. The stdio connector's message shall also say that Halonic stopped the program and that the next call starts it again. Any other failed call shall throw as before.

## Examples

- Given the stdio connector `notes` with a request timeout of 5 seconds, whose program doesn't answer a call to `read_note`,
  when 5 seconds pass,
  then the call throws a `ConnectorToolTimeoutError` with `withinMs` 5000 and the message `Connector "notes"'s tool "read_note" didn't answer within 5 seconds, so Halonic stopped its program. The next call starts it again.`, whose `cause` is the transport's `McpStoppedError`.
- Given the HTTP connector `notes` with a request timeout of 5 seconds, whose server doesn't answer a call to `read_note`,
  when 5 seconds pass,
  then the call throws a `ConnectorToolTimeoutError` with `withinMs` 5000 and the message `Connector "notes"'s tool "read_note" didn't answer within 5 seconds.`
- Given a program that stops while a call runs,
  when the call fails,
  then it throws the connector's own error, not a `ConnectorToolTimeoutError`.
