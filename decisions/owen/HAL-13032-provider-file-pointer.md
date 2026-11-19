# Decision: the 501 message points at the provider's file, not models.yaml

- Requirement: `model-anthropic.call-errors` (`packages/adapters/model-anthropic/requirements/call-errors.md`), `model-openai.call-errors` (`packages/adapters/model-openai/requirements/call-errors.md`)
- Task: HAL-13032, a follow-up to HAL-12608, from the C119 claims check on HAL-13025
- Approval: Liam's review on HAL-13032
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:NWxLFrk+mIQrl22B8iOkoOg5DyqRmdKC/DSDHFNmQkBTY0PcSn0JCEH3VcZyV4hzEHyTSEp4UraDL192JAnQBQ==

## What changes

When a provider answers HTTP 501 or 505, both model adapters still fail with `refused`, but the
message now says `so check the baseUrl in providers/local.yaml` instead of
`so check the baseUrl of local in models.yaml`. Both requirements and their examples say so.

## Why

`baseUrl` is a field of the provider's file, `providers/<id>.yaml`. models.yaml only holds the
model aliases, so the message from HAL-12608 sent people to a file where the setting isn't. The
new wording names the file the same way the workspace's own model texts already do.

## Tests

No test was weakened. The 501 and 505 cases in both adapters' error tables now expect
`providers/acme.yaml` in the message.

## Covers

- model-anthropic.call-errors
- model-openai.call-errors
