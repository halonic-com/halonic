# Decision: the PR template asks for a click step with a user-visible Studio requirement

- Approval: Liam decided it on HAL-18716 (point 5); Liam reviews and signs it on HAL-18865
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:qqb1w++/tAkPjUNQfIlXj+uD1vfZCzockFJdrA1RyuAxaPOnIlm8LGTQurdbW04QHu9Kl+qpHT1y40tjJksBCw==

`.github/pull_request_template.md` gets one line in its Requirements checklist: a
user-visible Studio requirement adds or extends a click step in the same PR.
`docs/guides/checks.md` and `docs/guides/review.md` say the same. Only wording changes; no
workflow, check, test or requirement is weakened.

## Why

HAL-18716 point 5: click-test coverage should follow the requirements it checks, so a new
user-visible Studio requirement comes with its click step instead of a later catch-up.

## Covers

- .github/
