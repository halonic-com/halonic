# Decision: the trust check names a local integration's secret picks

- Task: HAL-14734
- Approval: the team's call on HAL-14734, a follow-up to Nina's review of halonic#4144 (C469 N1); the words are Mara's on HAL-14737. A team decision with no board card (HAL-2282 rule): it extends the trust check's approved "gets the secret" wording to one more kind of row, no new screen or flow.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Rmn1Md1Pi28jxC7rq+5l7yVczcyI5GQApv+Es/YAggUvypreiN/Far6/MAhlM8gLt6TnarAQdGQGzyysqvk1CQ==

## What changes

A connector with the `integration` transport was listed under Addresses as `integration`, with
no word about the secrets it picks. Its row now names its folder, `integrations/<folder>`, and the
workspace secret each secret of the integration's sheet gets, by name only:
`notes   integrations/notes · gets the secret my-notes-key as notes-key`. `as` is left out when
both names are the same. Studio shows the same row with a `Gets secrets` line. The picks count as
secrets in the "Will pass N secrets" summary.

The requirements `cli.trust-check` and `studio.workspace-trust-review` gain a sentence and an
example for this. No test was weakened or skipped; the existing tests run unchanged.

## Why

The fingerprint already covers each pick, so a changed pick asks for trust again, but the person
answering yes couldn't see which of their secrets goes to which integration.

## Covers

- cli.trust-check
- studio.workspace-trust-review
