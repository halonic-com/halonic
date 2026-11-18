# services.agent-host-not-answering

- Status: active
- Since: unreleased
- Source: HAL-12410 (UX check G2 on HAL-12390: "the engine isn't answering. It may still be starting.")

When the shell refuses an agent host call or stream with `host_unavailable`, because the host isn't running, didn't start or didn't answer in time, the transport shall reject with an `AgentHostNotAnswering`: an `EngineNotAnswering` of kind `unavailable`, so each screen words it from `engineWords` and offers **Try again**. It shall keep `status` `0`, `code` `host_unavailable`, the shell's sandbox `reason` when there is one, and the shell's refusal as its `cause` for the log, and its message shall be the engine's, never the shell's.

## Examples

- Given the shell refuses `GET /v1/health` with `host_unavailable`,
  when the engine calls it,
  then the call rejects with an `EngineNotAnswering` of kind `unavailable`, with status `0` and code `host_unavailable`, and the shell's message only in its `cause`.
- Given the shell refuses with `host_unavailable` and the reason `distro-missing`,
  when the engine calls a route,
  then the error's `reason` is `distro-missing`.
- Given the shell refuses to open a stream with `host_unavailable`,
  when the engine opens it,
  then it rejects with an `EngineNotAnswering`.
