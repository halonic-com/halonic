# Decision: a connector tool that answered with an error failed, it didn't break off

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12342 (Liam, CTO; decided in the task)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kv7gocFf2XGxtmVSYbFf9hXVh+kk7ds010zBQZOsbpo9ZhBqqkoKnEGmodiHHbIBTo/G1QTb63h9YII2uZ3MBQ==
- Task: HAL-12342

A connector's tool that answers with an error of its own, such as a file tool that finds no file,
was logged like a call that broke off: `tool.result` with `outcome: "unknown"`, the text "The call
broke off without an answer, so it may or may not have done its work", and the tool's own text
dropped. The run then waited for `retry` or `skip`, though the server had answered.

Such a call now gets `outcome: "error"`, with the connector's message and the tool's own text, and
the agent goes on with it in its next model call, the tool's text fenced as untrusted. A call that
gets no answer at all (the program died, the connection dropped, it ran out of time) keeps
`outcome: "unknown"` and still waits for `retry` or `skip`.

- The outcome set is `ok | error | unknown`; `error` is the one for a failed call. The run's state
  machine already handled it, so it doesn't change.
- `ConnectorToolError` moves from `adapter-mcp` to `ports` (new requirement
  `ports.connector-tool-error`), so the engine can tell the two cases apart without importing an
  adapter. `adapter-mcp` still exports it.

## Covers

- engine.run-connector-calls
