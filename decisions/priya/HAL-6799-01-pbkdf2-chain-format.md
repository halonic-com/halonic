# Decision: the scrypt hash format is for scrypt adapters, not every adapter

- Approval: HAL-6789 (Liam's decision 3 on the password port, 12 Nov), following Julian's HAL-136
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:50Lb5llcMhzmwN25iBj67KEUkDS7J8HS7zuonR7W/rF8h1IydZENZb7a83fxXZSW7BR2+93xmNb7G/H16WlaCQ==
- Task: HAL-6799

## What changes

`ports.password-hash-format` said that all `PasswordHasher` adapters make and accept the
`$scrypt$…` format. It now says the scrypt adapters do, and its source line points to the
second format, `ports.password-hash-format-pbkdf2-chain`, which cloud targets use. It gains
one example: a hash in the cloud format makes `verify` throw a `RangeError`, never `false`.
Nothing is removed or weakened: every scrypt rule, range and vector stays as it was, and
its test is unchanged.

## Why

Julian's HAL-136 decision moved cloud targets to chained PBKDF2, because WebCrypto has no
memory-hard hash and a Worker can't run scrypt at safe settings. Liam decided on HAL-6789
that the port keeps version 1 and gets a second, additive format, and that each format's
requirement says a hash in the other format is a configuration error. No hasher exists
yet, so nothing that runs today changes. This is internal: no screen or wording a user
reads changes.

## Covers

- ports.password-hash-format
