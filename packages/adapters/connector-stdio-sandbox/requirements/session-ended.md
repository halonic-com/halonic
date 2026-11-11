# connector-stdio-sandbox.session-ended

- Status: active
- Since: 0.1.0
- Source: HAL-1738 (plugins P5), plan rule 9; Liam's review on HAL-4783: the "session ended" signal is a typed error the host checks, not a message to match; his review on HAL-4840: which error wins once the restart limit has stopped the connector

When the connector's sandbox session has ended (its fence proof is `stopped`), every call shall fail with `SandboxSessionEndedError` and start nothing, and a call that waited when the session ended shall fail with the same error. This error shall win over `ConnectorStoppedError`: a connector the restart limit stopped still reports an ended session as ended, so the host opens a new one. Closing the connector shall stop its program and leave the session open: the host that opened the session closes it, and opens a new session and connector for the next call.

## Examples

- Given a connector whose session has been closed,
  when it lists its tools,
  then it throws `SandboxSessionEndedError` and `session.start` is never called.
- Given a call waiting on the program,
  when the session closes,
  then the call fails with `SandboxSessionEndedError`.
- Given a connector the restart limit has stopped,
  when its session closes and it lists its tools,
  then it throws `SandboxSessionEndedError`, not `ConnectorStoppedError`.
