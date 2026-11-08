# integration-kit.local-http-hosts

- Status: active
- Since: 0.1.0
- Source: HAL-135 (Ravi's review of #86)

The limited client shall send plain `http` only to a host in the policy's local hosts that is `localhost`, a loopback address or a private network address, and shall place a secret over plain `http` only when the host is this machine.

## Examples

- Given local hosts `localhost:3000` and `192.168.1.5:8080`,
  when the integration fetches `http://localhost:3000/mcp` with a key, or `http://192.168.1.5:8080/mcp` without one,
  then the request is sent.
- Given the same policy,
  when the integration sends a key to `http://192.168.1.5:8080/mcp`,
  then the kit refuses with `secret-over-plain-http` and sends nothing.
- Given a public host or `169.254.169.254` in the local hosts,
  when the integration fetches it over plain `http`,
  then the kit refuses with `scheme-not-allowed`.
