# integration-kit.error-kinds

- Status: active
- Since: 0.1.0
- Source: HAL-1910 (plan section 4: every error a surface reports has an error kind from `@halonicjs/std`)

The kit shall give every error it raises a `kind` from `@halonicjs/std`, so a surface reads it with `errorKindOf` and responds without knowing the kit's codes. An `IntegrationRefusedError` shall be `invalid_input` when the request is wrong in itself (`bad-url`, `body-not-supported`, `secret-needs-form-body`, `request-too-large`), `unavailable` for `response-too-large`, and `denied` for every other code. An `IntegrationTimeoutError` shall be `unavailable`. The codes stay as they are; `kind` is added next to them.

## Examples

- Given each refusal code,
  when the kit raises an `IntegrationRefusedError` with it,
  then its `kind`, and what `errorKindOf` reads from it, is the kind above, such as `denied` for `host-not-allowed` and `invalid_input` for `request-too-large`.
- Given a request that runs out of time,
  when the kit raises an `IntegrationTimeoutError`,
  then `errorKindOf` reads `unavailable`.
