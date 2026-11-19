# studio.src-tauri.crates.tunnel.session-rekey

- Status: draft
- Since: unreleased
- Source: HAL-12244, HAL-12487; tunnel phase B build plan, decisions 8 and 9 (HAL-12232); ADR "Pairing and the end-to-end session"

The phone shall carry one gateway message of at most 65,519 bytes in one Noise transport message. It shall send a `rekey` frame, an empty transport message, as its 10,000th transport message since its last one or 30 minutes after it, whichever comes first, even when it has nothing else to send, and then rekey its sending direction. When the host's `rekey` frame arrives, the phone shall rekey its receiving direction. When a 10,001st message arrives without a `rekey`, a `rekey` frame isn't empty, a message doesn't decrypt, or a refusal arrives after a reconnect or after any frame from the host has decrypted, the phone shall end the session. Once the session has ended, it shall read and send nothing more.

## Examples

- Given a session that has sent 9,999 messages,
  when the phone sends one more,
  then a `rekey` frame goes first and the host still reads the message.
- Given a quiet session,
  when 30 minutes have passed,
  then the phone sends a `rekey` frame.
- Given a host that sent 10,000 messages without a `rekey`,
  when one more arrives,
  then the session ends.
- Given a message of 65,520 bytes,
  when the phone seals it,
  then it is refused and the session goes on.
- Given a frame that doesn't decrypt,
  when a valid frame arrives after it,
  then the session has already ended and refuses it.
- Given a pairing session in which the host's `rekey` frame decrypted,
  when a cleartext `pair-refused` arrives,
  then it is unreadable.
