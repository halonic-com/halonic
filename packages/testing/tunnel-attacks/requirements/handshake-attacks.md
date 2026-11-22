# tunnel-attacks.handshake-attacks

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 1, 2, 7 and 10 and the B7 row (HAL-12232); task HAL-12242, and condition 1 of the review of decision 7 on it; ADR "Pairing and the end-to-end session"; attack case B11

When clients reach the host's pairing through a tunnel, the pairing code and the check code shall never leave the host's dialog: not in any frame the host sends (the test client masks its own frames, so the search of the wire checks the host's side), as shown, grouped, in lower case, as the QR code's bytes or as the psk, not in a `pair-refused`, which is three bytes, not in the host's log and not in the mDNS records, whose TXT record carries the computer's name. A v1 `hello` in the clear, a transport message, a rekey or a frame only the host sends, with no handshake before it, shall get no answer at all; a pairing message 3 with no message 1 before it, and a reconnect's message 1 sent as a pairing's, shall get no answer and count no try; a pairing's message 1 sent as a reconnect's shall get at most a cleartext `handshake-failed`. A handshake message of 1,024 bytes shall be read (with no code open, a pairing's message 1 gets its `pair-refused`; a reconnect's that doesn't decrypt gets `handshake-failed`), while one over 1,024 bytes shall close the connection without an answer or a try; inside a session a message of 65,519 bytes shall be read, while a frame announcing one byte more than the largest Noise message and its kind byte shall close the connection before its body arrives.

## Examples

- Given a wrong try, a refused message 1 and a phone paired after Allow,
  when the bytes on the wire, the host's log and the mDNS datagrams are searched,
  then none holds the pairing code or the check code in any written form, and each `pair-refused` is three bytes.
- Given a connection with no handshake,
  when it sends a v1 `hello` in a text or a binary frame, a transport message, a rekey, or a `pair2`, `resume2` or `pair-refused` frame,
  then the host closes and sends nothing.
- Given an open code,
  when a lone message 3, a reconnect's message 1 under the pairing kind, or a pairing's message 1 under the reconnect kind arrives,
  then the host sends nothing, or only `handshake-failed` for the last, and the code keeps its tries.
- Given no open code, then an open one,
  when a pairing's and a reconnect's message 1 of 1,024 bytes arrive, then the same of 1,025 bytes,
  then the first get `pair-refused` and `handshake-failed`, the longer ones get nothing, and the open code keeps its tries.
- Given a paired phone in its session,
  when it sends a message of 65,519 bytes, then only the header of a frame one byte longer than the largest,
  then the first is answered, and the second closes the connection with no answer.
