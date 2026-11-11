# connector-stdio-sandbox.call-timeout

- Status: active
- Since: 0.1.0
- Source: HAL-1738 (plugins P5), plan rule 7; plugin manifest `localTools[].callTimeoutMs`: one tool call; the session's own time limit is Halonic's

When a tool call takes longer than the local tool's `callTimeoutMs`, the sandboxed stdio connector shall fail that call, saying how long it waited, and stop the program, which may be stuck. The next call shall start the program again in the same session, within the restart limit.

## Examples

- Given a local tool with a `callTimeoutMs` of 50 whose first call is never answered,
  when it is called twice,
  then the first call fails after 0.05 seconds, the program is stopped, and the second call starts a new program that answers.
- Given a local tool with a `callTimeoutMs` of 1000 and a stdio `requestTimeoutMs` of 50,
  when a call is answered after 0.15 seconds,
  then the call succeeds: the manifest's value bounds it, not the request timeout.
