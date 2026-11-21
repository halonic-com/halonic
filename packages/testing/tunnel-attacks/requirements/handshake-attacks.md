# tunnel-attacks.handshake-attacks

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 1, 2, 7 and 10 and the B7 row (HAL-12232); task HAL-12242, and condition 1 of the review of decision 7 on it; ADR "Pairing and the end-to-end session"; attack case B11

When clients reach the host's pairing through a tunnel, the pairing code and the check code shall never leave the host's dialog: not in any frame either way, as shown, grouped, in lower case, as the QR code's bytes or as the psk, not in a `pair-refused`, which is three bytes, not in the host's log and not in the mDNS records, whose TXT record carries the computer's name. A v1 `hello` in the clear, a transport message, a rekey or a frame only the host sends, with no handshake before it, shall get no answer at all; a pairing message 3 with no message 1 before it, and a reconnect's message 1 sent as a pairing's, shall get no answer and count no try; a pairing's message 1 sent as a reconnect's shall get at most a cleartext `handshake-failed`. A handshake message over 1,024 bytes shall close the connection without an answer or a try, and inside a session a message of 65,519 bytes shall be read while a Noise message one byte longer than the largest shall close the connection unread.

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
- Given a paired phone in its session,
  when it sends a message of 65,519 bytes, then one sealed message with a byte added,
  then the first is answered, and the second closes the connection with no answer.
