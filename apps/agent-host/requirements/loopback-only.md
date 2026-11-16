# agent-host.loopback-only

- Status: active
- Since: 0.2.0
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5685

The bridge, the model gateway, MCP, the secrets and token stores, the harnesses, the agent host's own server and the remote gateway shall never listen on an address beyond this computer: every `listen` in their code shall name a loopback constant or literal, or a Unix socket's path, and none shall name a wildcard address. A test shall fail when one does. The remote gateway is the only listener a tunnel may reach, by forwarding to its loopback port.

## Examples

- Given the source of those packages,
  when each `listen` call is read,
  then every one names a loopback constant, `127.0.0.1` or a socket path, and none names `0.0.0.0` or `::`.
- Given the host's server and the gateway listening,
  when a connection is made to this computer's LAN address on their ports,
  then it is refused, and one to `127.0.0.1` is accepted.
