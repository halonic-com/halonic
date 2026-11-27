# toolscript-quickjs.host

- Status: active
- Since: unreleased
- Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, sections 3.2 (S3, S4, S7, S9, S14 to S17) and 5; task HAL-17570

When the QuickJS adapter's ToolScript host runs an artifact, it shall run it with `@halonicjs/toolscript-host` over a fresh QuickJS isolate, so that it passes the `ToolScriptHost` contract for each audience, and so that a real script can't read a secret input's value, can't put a handle outside a declared secret field, can't write outside the header's `touches`, and can't put an `irreversible` write in a batch.

## Examples

- Given a user host and the contract's `acme` registry,
  when the contract suite runs,
  then every case passes.
- Given a script that returns `JSON.stringify(ctx.input)` for a secret input,
  when it is run,
  then the output doesn't contain the secret's value.
