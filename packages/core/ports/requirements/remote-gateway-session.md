# ports.remote-gateway-session

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 1–9 (HAL-12232); task HAL-12235; ADR "Pairing and the end-to-end session"

The end-to-end session shall open with a Noise handshake and carry every gateway message inside a Noise transport message, so no gateway message is ever sent in cleartext. Pairing shall use `Noise_XXpsk3_25519_ChaChaPoly_SHA256`, on the QR and the typed route alike, with the psk taken from the code and never sent; reconnecting shall use `Noise_IK_25519_ChaChaPoly_SHA256` to the host key the phone pinned. Both handshakes shall use the prologue `halonic-gateway/2`.

**Commitment.** Pairing message 1 shall carry the phone's commitment to message 3: the SHA-256 of `halonic pair commit v1`, the phone's 32-byte static public key and the exact bytes of its message 3 payload, which shall hold a fresh 16-byte nonce. The host shall recompute it once message 3 decrypts, so that an attacker who knows the code can't search for a message 3 that makes the two check codes match.

**Frames.** Every frame shall be binary, one kind byte from `gatewayFrameKinds` followed by one Noise message, at most 65,536 bytes in all. A handshake message shall be at most 1,024 bytes, and a name in a handshake payload at most 64 bytes of UTF-8. A handshake not finished within 10 seconds of its first frame shall be closed, by the phone as well as the host. An unknown kind, a kind the other side doesn't send, a handshake frame out of order or a text frame shall close the connection.

**Cleartext refusals.** The only cleartext frames shall be `handshake-failed`, which has no body, and `pair-refused`, with a reason (`wrong-code`, `code-ended`, `code-used` or `rate-limited`) and the tries left: 1 to 4 for `wrong-code`, 0 for the rest. The host shall close after either. Both are informative, and the phone shall clear nothing because of one. Reading one shall accept exactly what writing one gives, and nothing else.

**Pairing rules.** A pairing code shall live 5 minutes and pair at most one phone; the first message 3 that decrypts with it uses it up. The host shall then wait 2 minutes for Allow. A message 3 that doesn't decrypt, or whose commitment doesn't match, is a wrong try and doesn't use the code up; 5 end the code, and a host shall take at most 10 failed tries a minute across all codes.

**Rekeying and length.** A sender shall send a `rekey` frame at least every 10,000 transport messages or 30 minutes, whichever comes first, and rekey its sending direction after it; a reader shall close the connection when the 10,001st message arrives without one. The host shall end a session after 24 hours.

## Examples

- Given the session,
  when its handshakes are read,
  then pairing is `Noise_XXpsk3_25519_ChaChaPoly_SHA256`, reconnecting is `Noise_IK_25519_ChaChaPoly_SHA256` and the prologue names version 2.
- Given the frame kinds,
  when their bytes are listed,
  then each is different and only `handshake-failed` and `pair-refused` are cleartext.
- Given a `pair-refused` with `wrong-code` and 4 tries left,
  when it is written and read back,
  then it is the same frame.
- Given a `pair-refused` with `wrong-code` and 0 or 5 tries left, or with `code-used` and 1 try left,
  when it is written,
  then it throws a `RangeError`.
- Given bytes with an unknown reason, a wrong length, or tries left the rules don't allow,
  when they are read as a cleartext frame,
  then they are not one.
- Given a phone's 32-byte static key and its message 3 payload,
  when the commitment's input is built,
  then it is `halonic pair commit v1`, the key and the payload, in that order, and a key of another length is refused with a `RangeError`.
- Given the pairing rules,
  when they are read,
  then a code lives 5 minutes, Allow is waited for 2 minutes, 5 wrong tries end a code and a host takes at most 10 failed tries a minute.
- Given the session limits,
  when they are read,
  then a handshake times out after 10 seconds, a sender rekeys every 10,000 messages or 30 minutes, and a session lasts at most 24 hours.
