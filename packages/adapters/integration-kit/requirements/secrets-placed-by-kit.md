# integration-kit.secrets-placed-by-kit

- Status: active
- Since: 0.1.0
- Source: HAL-135 (secrets tied to their provider and address)

The kit shall place a secret in a request only when the policy declares the secret and allows it for the request's host, and the integration shall never receive the value. An error shall never contain a secret value.

## Examples

- Given `example-key` allowed for `api.example.com`,
  when the integration asks for it as a bearer token, a named header or a form field,
  then the transport sees the value in that place.
- Given the same policy,
  when the integration asks for an undeclared secret, or for `example-key` on another declared host,
  then the kit throws and sends nothing.
- Given a declared secret that isn't configured,
  when the integration asks for it,
  then the kit throws `secret-not-configured` and sends nothing.
