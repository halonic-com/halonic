# toolscript-host.secret-fields

- Status: active
- Since: unreleased
- Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 3.2 (S7); task HAL-17570

When a run's input has a field the header marks `secret`, the toolscript-host package shall give the script only a handle made for that run, shall refuse with `toolscript.bad-handle` a call that puts a handle anywhere but a top-level field the capability declares secret, and shall let the capability read the value only while the run is open. In this version the handle is put straight into `ctx.input`; there is no `ctx.input.secret()`.

## Examples

- Given a secret input `token`,
  when the script reads `ctx.input.token`,
  then it gets a handle, not the value.
- Given a capability with the secret field `value`,
  when the script passes the handle in `value`,
  then the capability reads the value through its call context.
- Given the same handle passed in the field `name`,
  when the call is made,
  then the run stops with `toolscript.bad-handle` and nothing is sent.
- Given the handle nested inside a declared secret field, as in `{ value: [token] }`,
  when the call is made,
  then the run stops with `toolscript.bad-handle`, nothing is confirmed and nothing is sent.
