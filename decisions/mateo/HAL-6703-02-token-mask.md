# Decision: drop an empty hash-length assertion from the Cloudflare live adapter tests

- Task: HAL-6703
- Approval: Liam (CTO) approves lowering the expect count of `cloudflare-live.adapters` from 11 to 10, in /HAL/issues/HAL-10314#comment-a50345f2-04c9-430c-8d4a-834b580a100f
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6vq3uNloiz1hZmSXXiJh4Dsc7IxEv96b+4H8w3pXC0M4jAeuu0Lc/uSbyJFLpStvooSUvV1lMYY0Gxm1SbmqBA==

## What changes

The runner token is now made in the test and masked before the deploy starts. The `createHash(...).toHaveLength(64)` assertion is removed. The tests of `cloudflare-live.adapters` make 10 `expect` calls, not 11 as on the merge base.

## Why

The removed assertion checked the length of a hash computed in the test itself, not anything the adapters produce, so it could never fail for a real reason. No coverage is lost: every value the adapters return is still checked.

## Covers

- cloudflare-live.adapters
