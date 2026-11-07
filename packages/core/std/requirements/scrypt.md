# std.scrypt

- Status: active
- Since: 0.1.0
- Source: HAL-104 (multi-cloud ADR section 8: `PasswordHasher` uses scrypt from `core/std` on every target)

The scrypt function shall derive keys as RFC 7914 specifies, built on the in-house SHA-256, without using platform cryptography.

## Examples

- Given the password "password", the salt "NaCl", N = 1024, r = 8, p = 16 and 64 bytes, when the key is derived, then it matches the RFC 7914 section 12 vector starting `fdbabe1c`.
- Given the password "pleaseletmein", the salt "SodiumChloride", N = 16384, r = 8, p = 1 and 64 bytes, when the key is derived, then it matches the RFC 7914 vector starting `7023bdcb`.
- Given the ADR settings (N = 2^14, r = 8, p = 5), when a 32-byte key is derived, then it equals `node:crypto`'s `scryptSync`.
- Given 12 generated passwords, salts and settings, when each key is derived, then every key equals `scryptSync`'s.
