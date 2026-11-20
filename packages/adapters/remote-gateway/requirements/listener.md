# remote-gateway.listener

- Status: active
- Since: unreleased
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5685, board decision 4a; end-to-end session from task HAL-12238 (tunnel phase B, B3)

The remote gateway's listener shall listen on 127.0.0.1 only, on the port it is given or a free one, and shall start only when the host asks it to: nothing starts it by default. It shall make a WebSocket of a request only when the request's `Host` is the loopback address or `localhost` with this port, or one of the extra names it was given (compared in lower case), when the request has one `Host` line only, when the request has no `Origin`, and when it is a version 13 upgrade of GET `/v1/gateway` with a valid key; it shall answer a wrong `Host`, or a second `Host` line, with 421, an `Origin` with 403 and anything else with 404 and an empty body, so a caller learns nothing about what listens. It shall read the frames of `remote-gateway.websocket-frames`, give each binary frame to the end-to-end session of `remote-gateway.e2e-session`, inside which the connection of `remote-gateway.connection` runs, answer a ping with a pong, and close, sending nothing, on a text frame, on a close frame, on a frame that breaks the format and on a frame that declares more than 65,536 bytes (a kind byte and one Noise message), without reading it. It shall drop a connection whose handshake hasn't ended within a set time (10 seconds by default) and an open session that has not said hello within a set time (10 seconds by default), destroy the socket of a connection that was closed but whose peer does not end its side, and close a connection that has more than 16 frames waiting for their turn. It shall ping each connection every heartbeat and drop one that sent nothing for 2.5 heartbeats, hold at most a set number of connections (8 by default), and stop a connection's watches when it ends. When a connection's session throws, because the host's pairing service or phone store failed, it shall end that connection only and report the error to the host. It shall not give a client any route to the bridge, the model gateway, MCP servers or secrets.

## Examples

- Given a handshake that names `127.0.0.1` and the listener's port,
  when it is sent,
  then the answer is 101.
- Given a handshake that names `evil.example`, or the right address on another port, or no port,
  when it is sent,
  then the answer is 421.
- Given a handshake with two `Host` lines, one of them ours,
  when it is sent,
  then the answer is 421.
- Given a handshake with an `Origin` header, `null` included,
  when it is sent,
  then the answer is 403.
- Given a handshake for `/`, `/v1/health`, with POST, with version 8, with a short key or without an upgrade,
  when it is sent,
  then the answer is 404.
- Given a plain HTTP GET of `/v1/gateway`,
  when it is sent,
  then the answer is 404 with an empty body.
- Given an open connection,
  when the client sends a frame that declares 65,536 bytes plus one,
  then the host closes without waiting for the rest and sends nothing.
- Given an open connection,
  when the client sends a text frame, even one holding a valid `hello`,
  then the host closes and sends nothing.
- Given a paired phone in its session,
  when it sends `hello`, `list-sessions` and `watch`,
  then the answers and events come back inside the session.
- Given an unmasked frame,
  when the client sends it,
  then the connection closes.
- Given a connection that sends nothing for 2.5 heartbeats,
  when the time is up,
  then the host drops it.
- Given a connection that answers pings but never finishes its handshake,
  when the handshake time is up,
  then the host drops it and its slot is free.
- Given an open session that never says hello,
  when the hello time is up,
  then the host drops it.
- Given one connection open and a limit of one,
  when another connects,
  then it is refused.
