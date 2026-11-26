# toolscript.context

- Status: active
- Since: unreleased
- Source: Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 3.2 (S2, S3); task HAL-17567

The toolscript package shall type a script's `ctx` from its header and a capability registry, so `ctx.input` has one property per declared input and `ctx` has only the capabilities in `uses`, and so a user context and an agent context are different types.

## Examples

- Given a header that uses only `acme.set-variable@1`,
  when a script reads `ctx.acme.setVariable`,
  then it type-checks; and `ctx.acme.deleteZone` doesn't.
- Given a secret input,
  when a script reads it from `ctx.input`,
  then it is a handle, not a string.
