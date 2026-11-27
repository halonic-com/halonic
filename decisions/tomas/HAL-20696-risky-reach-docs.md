# Decision: a confirmation card that approves a secret proposal is risky

- Approval: /HAL/issues/HAL-20696 (claims check of #6784; fix asked for by Nora's review of #6847)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ybqqV2qUsD8PFD0GHAZY2HoLKuFQQn1Tz8hiG22C5LXDgx1KYVObCu2EHDLx7yfpEf+x1QJSHjOoXjQHnndeAA==

Since #6784 (HAL-20441), a confirmation card whose `payload.secretProposal`
Paperclip set is `risky`, because its Accept binds that secret
(`paperclip-client.risky-reach`). `paperclip-client.approval-risk` still
said every card is `normal` except one that asks to run a tool. It now names
both exceptions and defers to `risky-reach` for the second, with an example.
The code doesn't change: `cards.ts` already does this and
`risky-reach.test.ts` tests it.

Users see it on the phone: such a card waits for their computer unless they
turn on "Let phones answer risky approvals". The pending changeset
`phone-inbox-risky-waits.md` now names it.

## Covers

- paperclip-client.approval-risk
