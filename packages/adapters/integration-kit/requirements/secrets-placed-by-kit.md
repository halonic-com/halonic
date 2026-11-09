# integration-kit.secrets-placed-by-kit

- Status: active
- Since: 0.1.0
- Source: HAL-135 (secrets tied to their provider and address)

The kit shall place a secret in a request only when the policy declares the secret and allows it for the request's host, and the integration shall never receive the value. An error shall never contain a secret value. A secret the policy marks `optional` shall be left out of the request when it isn't configured, and every other check shall still apply to it.

## Examples

- Given `example-key` allowed for `api.example.com`,
  when the integration asks for it as a bearer token, a named header or a form field, as its sheet says,
  then the transport sees the value in that place.
- Given the same policy,
  when the integration asks for an undeclared secret, or for `example-key` on another declared host,
  then the kit throws and sends nothing.
- Given a declared secret that isn't configured,
  when the integration asks for it,
  then the kit throws `secret-not-configured` and sends nothing.
- Given `example-key` marked optional and not configured,
  when the integration asks for it on `api.example.com`,
  then the kit sends the request without it.
- Given the same optional secret,
  when the integration asks for it on a host it isn't allowed for,
  then the kit throws `secret-not-allowed-for-host` and sends nothing.
