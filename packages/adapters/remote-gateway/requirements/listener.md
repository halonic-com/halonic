# remote-gateway.listener

- Status: active
- Since: unreleased
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5685, board decision 4a

The remote gateway's listener shall listen on 127.0.0.1 only, on the port it is given or a free one, and shall start only when the host asks it to: nothing starts it by default. It shall make a WebSocket of a request only when the request's `Host` is the loopback address or `localhost` with this port, or one of the extra names it was given (compared in lower case), when the request has no `Origin`, and when it is a version 13 upgrade of GET `/v1/gateway` with a valid key; it shall answer a wrong `Host` with 421, an `Origin` with 403 and anything else with 404 and an empty body, so a caller learns nothing about what listens. It shall read the frames of `remote-gateway.websocket-frames`, give each text or binary frame to the connection of `remote-gateway.connection`, answer a ping with a pong, close on a close frame and on a frame that breaks the format, and send `too-large` and close for a frame that declares more than 64 KiB without reading it. It shall drop a connection that has not said hello within a set time (10 seconds by default), destroy the socket of a connection that was closed but whose peer does not end its side, and close a connection that has more than 16 frames waiting for their turn. It shall ping each connection every heartbeat and drop one that sent nothing for 2.5 heartbeats, hold at most a set number of connections (8 by default), and stop a connection's watches when it ends. It shall not give a client any route to the bridge, the model gateway, MCP servers or secrets.

## Examples

- Given a handshake that names `127.0.0.1` and the listener's port,
  when it is sent,
  then the answer is 101.
- Given a handshake that names `evil.example`, or the right address on another port, or no port,
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
  when the client sends a frame that declares 64 KiB plus one byte,
  then the host sends `too-large` and closes without waiting for the rest.
- Given an unmasked frame,
  when the client sends it,
  then the connection closes.
- Given a connection that sends nothing for 2.5 heartbeats,
  when the time is up,
  then the host drops it.
- Given a connection that answers pings but never says hello,
  when the hello time is up,
  then the host drops it and its slot is free.
- Given one connection open and a limit of one,
  when another connects,
  then it is refused.
