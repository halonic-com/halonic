# tunnel-attacks.direct-hit

- Status: active
- Since: unreleased
- Source: tunnel phase A4 of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5687

The remote gateway shall be the only thing reachable from outside this computer, and only through a tunnel that points at its loopback port. The gateway and the run's bridge (the model gateway and the MCP routes) shall not accept a connection on this computer's other addresses; a tunnel shall never be given the bridge's port or an address other than loopback; and the gateway shall have no route to the bridge, the model gateway, MCP or secrets, whatever a client sends it through the tunnel.

## Examples

- Given the gateway and a run's bridge listening,
  when a client connects to either port on this computer's non-loopback address, or on `::1`,
  then the connection is refused.
- Given a tunnel config for the bridge's port, for `0.0.0.0`, for `localhost` or for a LAN address, or with a field besides `gateway`,
  then the host's check refuses it, and the fake provider's `start` rejects every one but the wrong port (which is the host's check to make), so no tunnel is made.
- Given a client that reaches the gateway through the tunnel's forwarder,
  when it asks for `/v1/messages`, `/v1/responses`, `/mcp`, `/v1/chat/completions` or a secrets path, with the run's token header or without it,
  then the answer is 404 with an empty body, and nothing on the host changes.
- Given a bridge with a valid run token,
  when a request names the tunnel's name as its `Host`,
  then the bridge answers 421.
