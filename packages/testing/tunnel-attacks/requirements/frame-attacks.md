# tunnel-attacks.frame-attacks

- Status: active
- Since: unreleased
- Source: tunnel phase A4 of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5687

The remote gateway shall answer a hostile stream of frames, sent through a tunnel, by closing that connection and nothing else: it shall refuse a message over 64 KiB before reading it, a frame that breaks the WebSocket format, a message that is not one JSON object of the protocol, and a client that floods it, holds slots or never says hello after the handshake. It shall pass nothing of such a stream on to the host, and it shall go on serving the next phone.

## Examples

- Given an open connection,
  when a frame declares 64 KiB plus one byte, 2^32 bytes or a length with the top bit set, whether or not the bytes follow,
  then the host sends `too-large` or closes, and holds no more than a frame's header.
- Given a message sent in fragments whose sum is over 64 KiB, or a stream of small fragments that never ends,
  then the connection is closed.
- Given an unmasked frame, a frame with a reserved bit, a reserved opcode, a fragmented or oversized control frame, or a close frame with a bad body,
  then the connection is closed.
- Given a text frame with invalid UTF-8, a NUL, a very deep nest, a leading byte order mark, a duplicated key or a `__proto__` key, or a binary frame,
  then the host sends `malformed` and closes, and the host is asked for nothing.
- Given more connections than the gateway allows, or 33 frames sent without waiting,
  then the extra connection or the flooding one is closed, and a slot is free again when a connection ends.
- Given any of the above,
  when a good phone connects afterwards,
  then it gets its `welcome`.
