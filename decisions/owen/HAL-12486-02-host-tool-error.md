# Decision: a connector tool's own error crosses the agent host

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12486 (Liam, CTO; asked for in his review on HAL-12342)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:b6R75pMnV24O49BBiU8/N49T1uofMhgj5fX/PrtsnEFbu04XJssaOwVi5OjPJbsyFOd0Tlf0eJ6VsCTY/FQgCA==
- Task: HAL-12486

Since HAL-12342, the engine logs a connector tool that answered with an error of its own as a
failed call (`outcome: "error"`, with the tool's text), and only a call that got no answer as
`unknown`. A `stdio` connector that Studio runs through the agent host still lost that difference:
the host answered every failed call with `502 connector_failed`, so the engine logged `unknown`,
and the run waited for `retry` or `skip`.

`POST /v1/connectors/call` now answers a tool that answered with an error with `200` and
`{ "toolError": "<the tool's text>" }`, and `agent-host-client` throws `ConnectorToolError` from it.
A call that gets no answer (the program died, the connection dropped, it ran out of time) still
answers `502 connector_failed` with the fixed message, and stays `unknown`.

- The tool's text crosses the host as a normal answer's `text` does: the server wrote it, and the
  engine fences it as untrusted. Any other error's detail still goes only to the host's log, since
  it can hold paths or secret values.
- `{ text }` and `{ toolError }` are two shapes of the same answer, not a new status, so a
  client that only knows `{ text }` refuses the answer instead of reading a tool error as success.

## Covers

- agent-host.connector-routes
- agent-host-client.connector
