# ports.password-hash-format-pbkdf2-chain

- Status: active
- Since: 0.1.0
- Source: [HAL-136](/HAL/issues/HAL-136#document-decision) (Julian, 8 Nov): cloud targets hash the sign-in password with chained PBKDF2-SHA256 from WebCrypto, because a Worker can't run scrypt at safe settings; added to the port on [HAL-6789](/HAL/issues/HAL-6789) (Liam, 12 Nov)

The chained PBKDF2 `PasswordHasher` adapters shall all produce and accept hashes in the form `$pbkdf2-sha256-chain$i=<rounds>,n=<runs>$<salt>$<hash>`, with exactly a 16-byte salt and a 32-byte hash in standard base64 without padding. The hash shall be computed as K0 = the NFC-normalised password as UTF-8, then Kj = PBKDF2-HMAC-SHA256(password Kj−1, the salt, i rounds, 32 bytes) for j = 1 to n, and the stored hash is Kn. New hashes shall use i=100000, n=6, and `needsRehash` shall return `true` for any other n. If a hash is malformed (another salt or hash length, `=` padding, the settings in another order or with leading zeros), in another format, or uses settings other than i exactly 100000 and n 6 to 20, then `verify` and `needsRehash` shall throw a `RangeError`, before any PBKDF2 work starts. `verify` shall compare the hash in constant time.

The vectors below come from Julian's decision, which computed them with WebCrypto `deriveBits` and with Node's `crypto.pbkdf2Sync`. The test next to this file recomputes them with `pbkdf2Sync` (OpenSSL), which shares no code with any adapter. The salt is the bytes 0 to 15. As a check of the single step, one PBKDF2-HMAC-SHA256 run over "password" and "salt" with 4,096 rounds gives the RFC 7914 section 11 value `c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a`, and one run (n = 1) over "correct horse battery staple" with the salt above and 100,000 rounds gives `49d49c25f597846209f0d92e7770ab64e1c75e94b4ce6c509265ee67175d2a1e` (both hex).

## Examples

- Given the password "correct horse battery staple",
  when it is verified against `$pbkdf2-sha256-chain$i=100000,n=6$AAECAwQFBgcICQoLDA0ODw$rfDFKdlz6hQsDnqes4jawGjfp+mn20j77PR84Xj0KfE`,
  then `verify` returns `true` on Node and on `workerd`.
- Given the password "pässwörd für halonic" typed with combining accents (a, o and u each followed by U+0308),
  when it is verified against `$pbkdf2-sha256-chain$i=100000,n=6$AAECAwQFBgcICQoLDA0ODw$ZxsiFH9QDVVYBRBEH1XLiBBMY48mu5N51MaOKGYfrNI`,
  then `verify` returns `true`, the same as for the password typed with U+00E4, U+00F6 and U+00FC.
- Given the password "correct horse battery stapler" and the first hash above,
  when it is verified,
  then `verify` returns `false`.
- Given the password "correct horse battery staple" and `$pbkdf2-sha256-chain$i=100000,n=7$AAECAwQFBgcICQoLDA0ODw$EDbbXUxT44YDF0NbM0rrUM1/M3pBYo7Vh+dtc81qGUA` (seven runs: in range, but not the current settings),
  when it is verified,
  then `verify` returns `true` and `needsRehash` returns `true`.
- Given a new hash from `hash("anything")`,
  when it is read,
  then it starts with `$pbkdf2-sha256-chain$i=100000,n=6$`, its salt decodes to 16 bytes and its hash to 32, `needsRehash` returns `false`, and `verify("anything", …)` returns `true`.
- Given the first hash above with `n=5`, or with `n=21`, or with `i=99999`, or with `i=200000`,
  when it is verified,
  then a `RangeError` says the settings are out of range, and it is thrown before any PBKDF2 work starts.
- Given the first hash above with `=` added to its salt, with its salt cut to 15 bytes (`AAECAwQFBgcICQoLDA0O`), with its hash cut to 31 bytes (`rfDFKdlz6hQsDnqes4jawGjfp+mn20j77PR84Xj0KQ`), with its settings written `n=6,i=100000`, or with `n=06`,
  when it is verified,
  then a `RangeError` says the hash is malformed.
- Given the hash in the `serve` format `$scrypt$ln=14,r=8,p=5$AAECAwQFBgcICQoLDA0ODw$D7lSJtJDGLLVcrxL7dWjkoRxbs+pMvcVYIJ+gbuyltk`, the hash `$pbkdf2-sha256$i=100000$AAECAwQFBgcICQoLDA0ODw$rfDFKdlz6hQsDnqes4jawGjfp+mn20j77PR84Xj0KfE`, or the text `not a hash`,
  when it is verified,
  then a `RangeError` is thrown, never `false`.

The contract suite `password-hasher` runs these examples against every chained PBKDF2 adapter.
