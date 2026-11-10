# http-node.own-ports

- Status: active
- Since: 0.1.0
- Source: HAL-983 (I5 design, HAL-958 attack case A10)

When a request goes to a host on this computer, the Node transport shall refuse it with `address-not-allowed` if the port is one of the own ports it was given, and shall read those ports again on every request.

## Examples

- Given a host on this computer and own ports that include the server's port,
  when a request is sent,
  then it is refused and the server sees no connection.
- Given a port added to the own ports after the client was made,
  when the next request goes to it,
  then it is refused.
