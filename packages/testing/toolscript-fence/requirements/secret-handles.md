# toolscript-fence.secret-handles

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, the T4 fence list in section 6), accepted by the board on HAL-10 on 24 Nov; task HAL-17569

Where an isolate implements `ToolScriptIsolate`, a secret handle a host function answers with shall reach the script only as an id made for that run, which doesn't contain the secret's reference, and shall reach a host function as the same handle; a forged id, an id from another run, and a handle in the output or in `ctx.log` shall stop the run with `toolscript.bad-handle`.

## Examples

- Given a handle from `ctx.secrets.get()`,
  when the script passes it to `ctx.acme.use({ token })`,
  then the host gets the handle itself.
- Given an id the script changed by one character,
  when it is passed to a host function,
  then the run stops with `toolscript.bad-handle`.
