# tunnel-attacks.frame-attacks

- Status: active
- Since: unreleased
- Source: tunnel phase A4 of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5687; the end-to-end session from task HAL-12238 (tunnel phase B, B3)

The remote gateway shall answer a hostile stream of frames, sent through a tunnel, by closing that connection and nothing else: it shall refuse a frame over one Noise message (65,536 bytes) before reading it, a frame that breaks the WebSocket format, a message in the clear, a message inside the session that is not one JSON object of the protocol, and a client that floods it, holds slots, never finishes the end-to-end handshake or never says hello after it. It shall pass nothing of such a stream on to the host, and it shall go on serving the next phone.

## Examples

- Given an open connection,
  when a frame declares 65,536 bytes plus one, 2^32 bytes or a length with the top bit set, whether or not the bytes follow,
  then the host closes, sends nothing, and holds no more than a frame's header.
- Given a message sent in fragments whose sum is over 65,536 bytes, or a stream of small fragments that never ends,
  then the connection is closed.
- Given an unmasked frame, a frame with a reserved bit, a reserved opcode, a fragmented or oversized control frame, or a close frame with a bad body,
  then the connection is closed.
- Given a message inside the session with invalid UTF-8, a NUL, a very deep nest, a leading byte order mark, a duplicated key or a `__proto__` key,
  then the host sends `malformed` inside the session and closes, and the host is asked for nothing.
- Given a protocol message in the clear, as a text or a binary frame,
  then the host closes and sends nothing.
- Given a connection that answers pings but never finishes the end-to-end handshake, or a session that never says hello,
  then the host drops it.
- Given more connections than the gateway allows, or 33 frames sent without waiting,
  then the extra connection or the flooding one is closed, and a slot is free again when a connection ends.
- Given any of the above,
  when a good phone connects afterwards,
  then it gets its `welcome`.
