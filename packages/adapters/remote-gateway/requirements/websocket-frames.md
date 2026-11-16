# remote-gateway.websocket-frames

- Status: active
- Since: 0.2.0
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5685

The gateway shall read WebSocket frames (RFC 6455) with its own reader, which accepts only masked, unfragmented text, binary, close, ping and pong frames with the reserved bits clear, since no extension is ever negotiated, and a control frame of at most 125 bytes; anything else is a protocol error and the reader reads nothing more. It shall decide that a message frame is too large from its header, with a length over the limit (a 64-bit length beyond what a number holds included), before it holds any of the payload, so a client can't make the host hold more than one message. It shall read frames whose bytes arrive in any split, and write the frames it sends unmasked, with the shortest length form.

## Examples

- Given a masked text frame sent one byte at a time,
  when each byte arrives,
  then one message comes out, after the last.
- Given a frame with a 16-bit and one with a 64-bit length,
  when they arrive together,
  then both are read.
- Given a header that declares 1,001 bytes and a limit of 1,000,
  when it arrives,
  then the reader says too-large and reads nothing more.
- Given an unmasked frame, a frame that isn't final, a continuation frame, a reserved type, a ping of 126 bytes or a frame with a reserved bit set,
  when it arrives,
  then the reader says protocol-error.
