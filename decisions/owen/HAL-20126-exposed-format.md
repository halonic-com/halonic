# Decision: users.exposed in deployments.yaml, the marks end users see

- Task: HAL-20126, plan HAL-20108 PR B0
- Approval: Liam decided option (a) and approved B0 with conditions on HAL-20126. Liam signs this note in his review, and Julian does the security pass
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gk0kACvB+4rMxhWzvP41NQ64t/ZWdC3tnrHpaus+j4Eh8tRmJOHg+Iisa67IGmH7ebINqOJg9R7yfJupC5GfBQ==

## What changes

A `mode: many` deployment may list in `users.exposed` the workflows its end users may start, and
everything they see of them: a name, a description, `chat` or `form`, labels for the inputs, and
the answers, results and approval texts shown. The marks live in the deploy file, not in the
workflow file, so everything an end user can see is reviewed in one place. Nothing is shown
unless it is listed, and `exposed` is refused unless `mode` is `many`. The deployments JSON
Schema is regenerated for the new field; the change only adds to it.

## Covers

- format.deployments-users-exposed
- packages/core/format/spec/deployments.schema.json
