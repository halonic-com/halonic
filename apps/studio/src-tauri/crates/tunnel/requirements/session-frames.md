# studio.src-tauri.crates.tunnel.session-frames

- Status: draft
- Since: unreleased
- Source: HAL-12244; tunnel phase B build plan, decisions 1, 4 and 9 (HAL-12232); ADR "Pairing and the end-to-end session"

The phone shall read a frame as one kind byte from `gatewayFrameKinds` followed by one Noise message, and shall refuse an empty frame, an unknown kind, a frame larger than 65,536 bytes and a handshake frame whose message is larger than 1,024 bytes. It shall read a cleartext frame only when it is exactly what the host's `encodeCleartextFrame` writes: `handshake-failed` with no body, or `pair-refused` with a known reason and the tries left the rules allow (1 to 4 for `wrong-code`, 0 for the rest). Anything else is bytes the phone can't read.

## Examples

- Given each frame kind,
  when its byte is read back,
  then it is the same kind, and only `handshake-failed` and `pair-refused` are cleartext.
- Given a `message` frame of 65,536 bytes and one of 65,537,
  when they are read,
  then the first is a frame and the second is refused.
- Given a `pair2` frame with a message of 1,025 bytes,
  when it is read,
  then it is refused.
- Given `pair-refused` with `wrong-code` and 5 tries left, or `code-used` with 1,
  when it is read,
  then it isn't a refusal.
