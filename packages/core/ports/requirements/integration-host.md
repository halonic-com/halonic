# ports.integration-host

- Status: active
- Since: 0.1.0
- Source: HAL-135 (step I2; secrets tied to their provider and address)

An integration shall reach the outside world only through the `IntegrationHost` it is given: an `IntegrationHttpClient` that places secrets for it, the tokens it writes itself and its settings. The host shall give it no raw `Secrets`, so integration code never holds a secret value. Every integration tool shall carry a `risk` of `read`, `write` or `send`. Connector tools may carry the same `risk` and an `untrusted` flag as optional fields, so version 1 of `ConnectorClient` keeps working.

## Examples

- Given an `IntegrationHost`,
  when code reads `host.secrets`,
  then it doesn't compile: the host has only `http`, `tokens` and `settings`.
- Given `IntegrationHost.http`,
  when it is used where an `HttpClient` is expected,
  then it compiles, and a request may name a secret with `auth: { secret, as: "bearer" }` but never carries its value.
- Given an `IntegrationTool`,
  when it has no `risk`, or a `risk` other than `read`, `write` or `send`,
  then it doesn't compile.
- Given a `ConnectorTool` written before this change, without `risk` or `untrusted`,
  when it is type-checked,
  then it still compiles.
