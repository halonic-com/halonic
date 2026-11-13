# Decision: the secret filter keeps access tokens ten minutes past their expiry

- Approval: HAL-8652, finding 3 of the attack tests on HAL-8618; the owner of the sign-in (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:oUDFh1msxIc/AWY/H62QBTvKMOsjG0y/VOl4AJk/B+7rSkexlriOsnTSaMRC0hURWQpBSu2oJwuJGzxMtAkHDQ==
- Task: HAL-8652

## What changes

`oauth-sign-in.sign-in-tokens` said the sign-in lists every access token not yet expired for the
secret filter. It now says the sign-in lists every access token until 10 minutes after its expiry.
Every other promise and example stays as it was. The one example about the filter list now checks
both edges (still listed 599 seconds past the expiry, gone at 600). No test was removed or weakened.

## Why

Many services honour an access token a few minutes longer than its `expires_in` says. A token
echoed back in that window was no longer in the filter, so it was not removed. The list stays
small: one entry per access token, dropped after the grace period.

## Covers

- oauth-sign-in.sign-in-tokens
