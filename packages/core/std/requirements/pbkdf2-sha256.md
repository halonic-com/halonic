# std.pbkdf2-sha256

- Status: active
- Since: 0.1.0
- Source: HAL-104 (multi-cloud ADR section 8: the PBKDF2 step inside scrypt)

The internal PBKDF2 function shall derive keys with PBKDF2-HMAC-SHA-256 as RFC 8018 specifies, for any key length.

## Examples

- Given the password "passwd", the salt "salt", 1 iteration and 64 bytes, when the key is derived, then it matches the RFC 7914 section 11 vector starting `55ac046e`.
- Given the password "Password", the salt "NaCl", 80,000 iterations and 64 bytes, when the key is derived, then it matches the RFC 7914 vector starting `4ddcd8f6`.
- Given key lengths of 1, 31, 32, 33, 64 and 100 bytes, when keys are derived, then every key equals `node:crypto`'s `pbkdf2Sync`.
