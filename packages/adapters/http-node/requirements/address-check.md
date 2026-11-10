# http-node.address-check

- Status: active
- Since: 0.1.0
- Source: HAL-983 (I5 design, HAL-958 section 3.8)

When the Node transport sends a request, it shall resolve the host name once, check every address of the answer against the host's class, connect only to an address it checked, and refuse with `address-not-allowed` before any connection when no address is left or the host has no class.

## Examples

- Given a public host whose answer is `127.0.0.1`, `10.0.0.5`, `169.254.169.254` or another address from attack case A7,
  when a request is sent,
  then it is refused and the server on that address sees no connection.
- Given a host on this computer whose answer is `10.0.0.5` and `127.0.0.1`,
  when a request is sent,
  then it connects to `127.0.0.1` only (A28).
- Given a host whose second answer differs from its first,
  when one request is sent,
  then the name is resolved once and the connection goes to the checked address (A8).
- Given a home-network host whose answer is public or link-local,
  when a request is sent,
  then it is refused (A9).
- Given an IP address in the URL,
  when a request is sent,
  then the address is checked as it is, with no lookup.
