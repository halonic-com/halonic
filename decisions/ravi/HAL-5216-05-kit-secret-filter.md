# Decision: the kit's text filter looks at each part of a text once

- Approval: the review follow-ups on [HAL-5216](/HAL/issues/HAL-5216) asked for it; the kit's owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WJ1+18/VN5javMQQTg26MYGljEJm1q/jiOUdgPfv3U9FuJS12Xio6d95zsPuazwp5Fnhn52B4h277RGdaaTwCQ==
- Task: HAL-5216

## What changes

`integration-kit.secret-filter` gains one promise and one example: `removeSecrets` looks at each
part of a text once, so a `[secret removed]` it wrote is never broken up by a secret that matches
part of it. Bodies already worked this way (`SecretRemover`). Every other promise and example stays
as it was. No test was removed or weakened.

The new `integration-kit.secret-min-length` (a refusal for values under 8 bytes) is a new
requirement, so it needs no note.

## Why

`removeSecrets` replaced one form after another in the whole text, so a later secret could match
inside a marker an earlier one had written. This tightens the filter.

## Covers

- integration-kit.secret-filter
