# tunnel-attacks.pairing-attacks

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 6 and 7 and the B7 row (HAL-12232); task HAL-12242; ADR "Pairing and the end-to-end session"; attack cases B2, B3 and B5

When phones pair through a tunnel with the host's own pairing desk, phone store and Pair a phone dialog behind the remote gateway, a pairing code shall pair at most one phone and only before it ends: a QR code used again after its phone paired, a QR code after its five minutes, and a code another phone already used shall each get a cleartext `pair-refused` at message 1 and pair nobody; five wrong tries, a handshake left after the host's message 2 counting as one, shall end the code; ten failed tries in a minute across codes shall make the host refuse message 1 until the minute is over; and a check code the person refuses with Don't allow, or doesn't answer within two minutes, shall leave no paired record, in memory or in the paired phones file, and tell the phone so only inside the session.

## Examples

- Given a phone that paired with a QR code,
  when another phone uses the same QR code,
  then it gets `pair-refused` with `code-ended`, and one phone is paired.
- Given a QR code five minutes old,
  when a phone uses it,
  then it gets `pair-refused` with `code-ended`, and the dialog says the code expired.
- Given a phone waiting for Allow,
  when a second phone, or a replay of the first phone's message 1, uses the same code,
  then it gets `pair-refused` with `code-used`, and only the first phone is paired after Allow.
- Given four wrong tries,
  when a fifth handshake is left after the host's message 2,
  then the code ends, and the right code is refused with `code-ended`.
- Given two codes that each had five wrong tries in the same minute,
  when a phone sends message 1 with the third code,
  then it gets `pair-refused` with `rate-limited`, and pairs once the minute is over.
- Given a phone at the check code,
  when the person presses Don't allow, or two minutes pass,
  then the phone reads `pair-refused` with `denied` or `timed-out` inside the session, Allow is refused, and no phone is in the store or its file.
