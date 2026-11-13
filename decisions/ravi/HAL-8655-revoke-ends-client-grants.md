# Decision: a sign-in can say that a revoke ends every grant of the client

- Approval: Liam's review on HAL-8655 (https://github.com/halonic-com/halonic/pull/2503#issuecomment-6858976414 and the approval after it); he judged the sheet field a technical choice inside the approved sign-in design
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xqIHmoUAQNMKMm/ZepFRxqbKJZW66f/Gxg+taQrP7nzPPVFCrmzD/3DM2QIkOCggNbYpwm0oBA3eBsAHijkdAA==
- Task: HAL-8655

## What changes

- A sign-in on the sheet may set `revokeEndsClientGrants`. When either the old or the new
  approval has it, and both name the same client and token server, signing in again drops the
  old grant without revoking it, and the outcome says `previousGrant: "skipped"`.
- The key stays out of the approved sign-in unless it is true, so the hash of existing grants
  does not change.
- The requirements `integration-sign-in.sign-in-flow`, `oauth-sign-in.sign-out`,
  `format.integration-sign-ins` and `format.integration-approved-sign-ins` describe the rule.
- The replaced-grant tests of the flow moved to `sign-in-again.test.ts` (the file limit), so
  `sign-in-flow.test.ts` runs fewer tests. The same cases still run, under the same requirement.
- The two JSON Schema golden files list the new key.

## Why

RFC 7009 lets a server revoke every token of a client and user. For such a provider, revoking
the old grant after the new code is exchanged also ends the new grant. Revoking before the
authorize step would lose the old grant if the new sign-in failed or was cancelled, and
guessing from the provider's name is nothing the sheet can show the user.

## Covers

- format.integration-approved-sign-ins
- format.integration-sign-ins
- oauth-sign-in.sign-out
- integration-sign-in.sign-in-flow
- packages/host/integration-sign-in/src/sign-in-flow.test.ts
- packages/core/format/spec/integration.schema.json
- packages/core/format/spec/plugin.schema.json
