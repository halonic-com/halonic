# Decision: a redirect holding a secret is refused as `secret-in-redirect`, not a leak attempt

- Approval: the attack tests on [HAL-4338](/HAL/issues/HAL-4338) asked for this on [HAL-4501](/HAL/issues/HAL-4501), and the kit's owner (Ravi) decided it there; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3wv13Qy3nqYWsID3pL/wXVbjQjHskjV54j8TWlLF+cRE7M0QRKrnRDvVgaCEi1ahK4TASlE2wyyRNWySnd3+CQ==
- Task: HAL-4501

## What changes

`integration-kit.secret-in-request` no longer covers the `Location` of a redirect. A redirect whose
`Location` holds a secret value, in the same forms as before, is still not followed, but the kit
refuses it with a new code, `secret-in-redirect` (kind `denied`). Its message names the two hosts
only, with any secret removed, and the request log keeps the integration's own request.

`integration-kit.leak-attempt-codes` gains one sentence and one example: `secret-in-redirect` stays
out of `leakAttemptCodes`. The list itself is unchanged.

Nothing that was refused before is now sent. No example was removed or weakened; the redirect
example of `integration-kit.secret-in-request` now expects the new code and also checks the log.

## Why

The server chose that URL, not the integration. With `secret-in-request` the bridge reported a
`leak-attempt` block, so an integration could be paused for something a server did, for example an
API whose "next page" link repeats the key in its query. A host can still tell the case apart and
show it, because it has its own code. An integration that controls an allowed server gains nothing
from this: the redirect is still refused and nothing is sent.

## Covers

- integration-kit.secret-in-request
- integration-kit.leak-attempt-codes
- packages/adapters/integration-kit/src/secret-in-request.test.ts
- packages/adapters/integration-kit/src/leak-attempt.test.ts
