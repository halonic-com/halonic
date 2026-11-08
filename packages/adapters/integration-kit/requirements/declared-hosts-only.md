# integration-kit.declared-hosts-only

- Status: active
- Since: 0.1.0
- Source: HAL-135 (plan 3.4, 15.2 step I2 and its attack tests; plan 11)

The limited client shall send a request only to a host its policy declares, matched exactly ignoring case, over `https`, and shall send nothing for any other URL.

## Examples

- Given a policy with `api.example.com`,
  when the integration fetches `https://API.example.com/v1`,
  then the request is sent.
- Given the same policy,
  when the integration fetches an undeclared host, a subdomain, a host that only starts with the declared one, another port, `http`, `file:`, `data:`, a URL with a user name or a relative URL,
  then the kit throws an `IntegrationRefusedError` and the transport sees no request.
