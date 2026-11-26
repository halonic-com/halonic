# websocket-frames.client-frames

- Status: active
- Since: unreleased
- Source: the sync service design on HAL-19201, approved by Liam with conditions (26 Nov); task HAL-19338 (PR 6 of that build)

The shared frame code shall read a server's frames for a client with the same rules as `remote-gateway.websocket-frames` reads a client's, except that a server's frame must be unmasked: a masked frame from a server is a protocol error, and the reader reads nothing more. It shall refuse a server's message frame over the limit from its header, before it holds any of the payload. It shall write a client's frame masked with the 4 bytes it is given, with the shortest length form, and refuse a mask of any other length.

## Examples

- Given an unmasked text frame from a server, sent one byte at a time,
  when each byte arrives,
  then one message comes out, after the last.
- Given a masked frame from a server,
  when it arrives,
  then the reader says protocol-error.
- Given a server frame whose header declares 1,048,577 bytes and a limit of 1,048,576,
  when its header arrives,
  then the reader says too-large and reads nothing more.
- Given a client frame written with a mask,
  when the remote gateway's reader reads it,
  then it gets the same payload back.
