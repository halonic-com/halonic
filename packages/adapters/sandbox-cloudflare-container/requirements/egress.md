# sandbox-cloudflare-container.egress

- Status: active
- Since: unreleased
- Source: HAL-17232; Containers outbound check on HAL-13211

The run's container shall start with its internet off, with intercepts only for the bridge's name and the profile's allowed sites, and every intercepted request shall be checked again: plain HTTP to the bridge's name goes to the bridge, HTTPS to an allowed site goes out, and anything else is refused with 403.

## Examples

- Given a profile with the bridge `bridge.halonic.invalid` and the allowed site `*.example.com`,
  when the container starts,
  then it starts with internet off and intercepts only those two.
- Given that gate,
  when a request goes to `api.example.com` over HTTPS,
  then it goes out; to `example.com`, `evil.test` or `api.example.com` over plain HTTP, it gets 403.
- Given a profile whose bridge is a loopback port,
  when the sandbox opens,
  then it is refused.
