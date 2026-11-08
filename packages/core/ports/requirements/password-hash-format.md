# ports.password-hash-format

- Status: active
- Since: 0.1.0
- Source: new in the core ports package: one hash format on every runtime, so a hash made locally verifies in the cloud

Every `PasswordHasher` adapter shall produce and accept hashes in the form `$scrypt$ln=<log2 N>,r=<r>,p=<p>$<salt>$<key>`, with exactly a 16-byte salt and a 32-byte key in standard base64 without padding, over the NFC-normalised UTF-8 password. New hashes shall use ln=14, r=8, p=5, and `needsRehash` shall return `true` for any other settings. If a hash is malformed (another salt or key length, or `=` padding), in another format, or uses settings outside ln 14 to 15, r 8 and p 5 to 16, then `verify` and `needsRehash` shall throw a `RangeError`.

The vectors below were computed with Node's `crypto.scryptSync` (OpenSSL), not with `core/std`, so they check the in-house scrypt against an independent implementation. The salt is the bytes 0 to 15.

## Examples

- Given the password "correct horse battery staple",
  when it is verified against `$scrypt$ln=14,r=8,p=5$AAECAwQFBgcICQoLDA0ODw$D7lSJtJDGLLVcrxL7dWjkoRxbs+pMvcVYIJ+gbuyltk`,
  then `verify` returns `true` on Node and on `workerd`.
- Given the password "Café" typed as "Cafe" plus U+0301 (combining acute accent),
  when it is verified against `$scrypt$ln=14,r=8,p=5$AAECAwQFBgcICQoLDA0ODw$uTLaEKfxixfKWAEXnGRbMwK/H3yGuy+bJGUxguLKks0`,
  then `verify` returns `true`, the same as for "Café" with U+00E9.
- Given the password "correct horse battery stapler" and the first hash above,
  when it is verified,
  then `verify` returns `false`.
- Given a new hash from `hash("anything")`,
  when it is read,
  then it starts with `$scrypt$ln=14,r=8,p=5$`, its salt decodes to 16 bytes and its key to 32, and `needsRehash` returns `false`.
- Given the hash `$scrypt$ln=13,r=8,p=5$AAECAwQFBgcICQoLDA0ODw$D7lSJtJDGLLVcrxL7dWjkoRxbs+pMvcVYIJ+gbuyltk`,
  when it is verified,
  then a `RangeError` says the settings are out of range.
- Given the same hash with `ln=20`, or with `r=16`, or with `p=17`,
  when it is verified,
  then a `RangeError` is thrown before any scrypt work starts.
- Given the same hash with `ln=15` (in range, but not the current settings),
  when `needsRehash` is called,
  then it returns `true`.
- Given the first hash above with `=` added to its salt, or with its key cut to 31 bytes,
  when it is verified,
  then a `RangeError` says the hash is malformed.
- Given the hash `$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA`, or the text `not a hash`,
  when it is verified,
  then a `RangeError` is thrown, never `false`.

The contract suite `password-hasher` (phase 3) runs these examples against every adapter.
