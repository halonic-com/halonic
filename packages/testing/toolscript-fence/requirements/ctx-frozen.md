# toolscript-fence.ctx-frozen

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, the T4 fence list in section 6), accepted by the board on HAL-10 on 24 Nov; task HAL-17569

Where an isolate implements `ToolScriptIsolate`, `ctx`, each namespace on it, each host function and the input shall be frozen, `ctx` and its namespaces shall have no prototype, a host function shall behave the same whatever its `this`, and a host function saved by the script shall never be called after the run has ended or a limit has tripped.

## Examples

- Given a script that keeps `ctx.acme.ping` and calls it after a host promise that settles once the run has ended,
  when the host promise settles,
  then `ping` isn't called.
- Given a script that calls `ctx.acme.ping.call(evil, { n: 1 })`,
  when the host function runs,
  then it gets `{ n: 1 }`, as for a plain call.
