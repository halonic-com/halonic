# runtime.password-limit

- Status: active
- Since: 0.1.0
- Source: HAL-6802, HAL-8635, HAL-6799 (Julian's security review)

The password hasher the Worker wires shall refuse a password longer than 1,024 bytes, counted as the hasher reads it (NFC, in UTF-8), before it does any PBKDF2 work: `verify` shall answer `false` and `hash` shall throw a `RangeError`, and neither shall call `deriveBits`. A password of exactly 1,024 bytes shall go on to the hasher.

Rationale: the hasher runs six runs of PBKDF2 on whatever it is given, so a caller who can send a long password would spend the Worker's CPU on every guess.

## Examples

- Given a password of 1,025 bytes, then `verify` answers `false` and `deriveBits` is never called.
- Given a password of 1,024 bytes, then `verify` checks it against the stored hash as usual.
- Given 400 times `e` and a combining accent (1,200 bytes as typed, 800 as NFC), then it is not too long.
