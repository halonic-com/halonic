# contracts.fake-tool-script-host

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, section 6, T1): what sits on top of the port is built and tested before an isolate exists; task HAL-17566

The `FakeToolScriptHost` shall be a `ToolScriptHost` that runs in the process, so what sits on top of the port can be built and tested before an isolate exists. It shall pass the `contracts.tool-script-host` suite for both audiences. It shall run only the scripts it was given, by `codeHash`, and answer any other artifact with `toolscript.unpinned`. It shall have its audience's default limits unless it is given its own, and shall answer `ctx.now()` from the clock it is given. It shall reject with a `RangeError` a request limit that isn't a positive whole number.

## Examples

- Given a fake for agents with no scripts,
  when it runs an artifact,
  then the result is `toolscript.unpinned`.
- Given a fake for agents with a memory limit of 128 MB,
  when its limits are read,
  then they are exactly the ones it was given.
- Given a request with the limit `{ calls: 0 }`,
  when the fake runs it,
  then `run` rejects with a `RangeError`.
- Given a fake whose clock says `2026-11-24T16:00:00.000Z`,
  when a script returns `ctx.now()`,
  then the output is that time.
