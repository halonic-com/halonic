# studio.src-tauri.crates.tunnel.session-handshakes

- Status: draft
- Since: unreleased
- Source: HAL-12244, HAL-12487; tunnel phase B build plan, decisions 2–4 (HAL-12232); ADR "Pairing and the end-to-end session"

The phone shall pair with `Noise_XXpsk3_25519_ChaChaPoly_SHA256` and reconnect with `Noise_IK_25519_ChaChaPoly_SHA256`, both with the prologue `halonic-gateway/2`, and `snow` shall do every Noise step. Pairing message 1 shall carry the commitment to a message 3 with a fresh 16-byte nonce. On the QR route, when the host's key in message 2 isn't the QR's, the phone shall stop before message 3 and report that it can't confirm the computer. After message 2 the phone shall give the host's name and key and the check code from the final handshake hash. A host name longer than 64 bytes, or with a control, line separator, bidi formatting or invisible character (a zero width space, word joiner, invisible operator or byte order mark), shall be unreadable. When reconnect message 2 doesn't decrypt to the pinned key, or the host sends `handshake-failed`, the phone shall report that it can't confirm the computer. A cleartext refusal the host doesn't send at that point, a frame of another kind or bytes it can't read shall be unreadable. None of these shall clear anything.

## Examples

- Given a host with the QR's key and the same code,
  when the phone pairs,
  then both sides compute the same check code and the host's recomputed commitment matches message 1.
- Given a host whose key isn't the QR's,
  when its message 2 arrives,
  then the phone can't confirm the computer and sends no message 3.
- Given a host with another code,
  when the phone sends message 3 and the host answers `pair-refused` with `wrong-code` and 4 tries,
  then the phone reports that refusal.
- Given the phone starts two pairings,
  when the host reads both message 1s,
  then the commitments differ.
- Given a host whose name in message 2 holds a right-to-left override, a line break or a zero width space,
  when the phone reads message 2,
  then it is unreadable.
- Given a phone reconnecting to a host that was reinstalled,
  when the host answers `handshake-failed`, or message 2 fails to decrypt,
  then the phone can't confirm the computer.
- Given a phone reconnecting,
  when `pair-refused`, a pairing frame or bytes of no known kind arrive,
  then they are unreadable.
