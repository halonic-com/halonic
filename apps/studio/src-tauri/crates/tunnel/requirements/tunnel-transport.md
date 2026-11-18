# studio.src-tauri.crates.tunnel.tunnel-transport

- Status: draft
- Since: unreleased
- Source: HAL-12244; requirement `ports.tunnel-resolver`; HAL-12354 (the WebSocket client and its limits)

The phone's transport shall give a connection only when its first try opens, and shall otherwise say why the try failed: the phone's own network is down, it timed out after 10 seconds, the computer refused it, or the computer was unreachable. Once open, it shall reconnect by itself after a drop, waiting by the shared backoff rule, without a limit on tries, and shall report each failed try with its reason. A frame sent while the state isn't open shall be refused, and no frame shall be queued or sent again on a later connection. It shall accept binary WebSocket frames of at most 65,536 bytes; a text frame or a larger frame shall drop the connection. Pausing shall close the connection and stop every timer; resuming shall connect at once and start the backoff from the first try. Closing shall end its events.

## Examples

- Given a gateway that refuses connections,
  when the transport connects the first time,
  then it reports that the computer refused it and doesn't try again.
- Given an open transport whose connection drops,
  when a frame is sent before it reconnects,
  then the frame is refused and the next connection never receives it.
- Given a paused transport,
  when 300 ms pass,
  then it hasn't tried to connect; when it resumes, it connects at once.
- Given a gateway that sends a text frame or a frame of 65,537 bytes,
  when it arrives,
  then the transport drops the connection and reconnects.
