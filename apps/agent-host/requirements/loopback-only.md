# agent-host.loopback-only

- Status: active
- Since: unreleased
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5685

The bridge, the model gateway, MCP, the secrets and token stores, the harnesses, the agent host's own server and the remote gateway shall never listen on an address beyond this computer: every `listen` in their code shall name a port and then a loopback constant or literal, or only a Unix socket's path; a `listen` with a port and no host listens on every address, so it fails, and none shall name a wildcard address. A test shall fail when one does. The remote gateway is the only listener a tunnel may reach, by forwarding to its loopback port.

## Examples

- Given a `listen` call with a port and no host, such as `server.listen(port)` or `server.listen(0, callback)`,
  when the check reads it,
  then it fails.
- Given the source of those packages,
  when each `listen` call is read,
  then every one names a loopback constant, `127.0.0.1` or a socket path, and none names `0.0.0.0` or `::`.
- Given the host's server and the gateway listening,
  when a connection is made to this computer's LAN address on their ports,
  then it is refused, and one to `127.0.0.1` is accepted.
