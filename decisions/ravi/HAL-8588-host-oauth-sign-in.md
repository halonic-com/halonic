# Decision: a sign-in says when its refresh has ended, so a sign-out can wait for it

- Approval: HAL-8588 (HAL-984 design, section 4, "Revoking and signing out"); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Vk75X4v445bMtFDaGy3VF9xoyuazrCsDp5rh4+iEzBH8MmYxm3Lcbw9NIXoZ/wBMX6kS91jMbCqZzOk/oM4CBg==
- Task: HAL-8588

## What changes

`oauth-sign-in.sign-in-tokens` gains one promise and one example: the sign-in says when no refresh
of a sign-in is running any more (`settled`). It resolves after a refresh in flight has ended, also
when the refresh failed, and at once when no refresh is running.

Every other promise and example stays as it was. No example was removed or weakened. The matching
test is added to `sign-in-tokens.test.ts`.

## Why

A sign-out must not remove the grant while a refresh is still waiting for the server: the refresh
could end late, save its rotated refresh token and sign the user in again. The host's sign-out
(`integration-sign-in.sign-out`) waits on `settled` first. The change only adds a way to wait and
changes no behaviour of the access token, so the note is internal.

## Covers

- oauth-sign-in.sign-in-tokens
- packages/core/oauth-sign-in/src/sign-in-tokens.test.ts
