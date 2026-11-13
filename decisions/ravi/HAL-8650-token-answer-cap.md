# Decision: cap the token answer's size and the length of a token

- Task: HAL-8650
- Approval: /HAL/issues/HAL-8650; the maintainer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Wza9ZdOETPOtyJFmL/6YHwHXR9zfrMsrA5Ji5IubB/2mvrKpZAlCKvWiqITBKc6ebBOgymyrNNXrPzy1vAMfBQ==

## What changes

Both requirements gain an upper bound; nothing they allowed before is
refused except an answer or a token beyond the bound.

- `oauth-sign-in.exchange-code`: the sign-in reads at most 64 KiB of a token
  endpoint's answer. An answer that declares more, or reaches more while it is
  read, is refused before it is parsed and counts as a provider that couldn't
  be reached. The rest of the body is never read. Why: the bound was
  designed, but no code enforced it, so a provider could make the host read an
  unbounded answer.
- `oauth-sign-in.usable-token`: an access or refresh token is usable only with
  at most 4096 characters, besides the 16 it needed at least. Why: real tokens
  have a few hundred to about two thousand characters and a server refuses a
  header much over 8 KiB, so a longer value is no token, and the host should
  not hold and save huge values.

## Covers

- oauth-sign-in.exchange-code
- oauth-sign-in.usable-token
