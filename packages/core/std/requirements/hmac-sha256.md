# std.hmac-sha256

- Status: active
- Since: 0.1.0
- Source: HAL-104 (plan 7.3, multi-cloud ADR section 8: the base of PBKDF2 and scrypt)

The HMAC function shall return the RFC 2104 HMAC-SHA-256 of a message under a key of any length.

## Examples

- Given the key "Jefe" and the message "what do ya want for nothing?", when the HMAC is computed, then it is `5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843` (RFC 4231 test case 2).
- Given a 131-byte key, longer than a block, when the HMAC is computed, then the key is hashed first and the result matches RFC 4231 test case 6.
- Given keys of 0, 1, 32, 63, 64, 65 and 200 bytes, when the HMAC is computed, then every result equals `node:crypto`'s.
