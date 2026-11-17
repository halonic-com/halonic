# Decision: requirements written after a release say `Since: unreleased`

- Task: HAL-11580
- Approval: Liam asked for this change on HAL-11580 (https://paperclip.halonic.com/HAL/issues/HAL-11580). A team decision with no board card.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XxQmRG3Mhx9FiKLHXkEJueoDp1PGSo+lXYyKKG7wRwjt8OaKg8Yf/G9y1i1cKGud7z0zdlisu8JLtsnBgxQjDQ==

## What changes

The trace check accepts `Since: unreleased` as well as a version. The 869 requirement files added
after `v0.1.0` said `Since: 0.1.0` (or a guessed `0.1.2` or `0.2.0`); they now say `unreleased`.
The release replaces it with the real version. No requirement text, test or status changes, and
no test was weakened or skipped; one test is added for the new value.

## Why

Work after the tag isn't in 0.1.0, and the next version isn't decided. The wrong `Since` made the
FAQ fact-check (HAL-11579) read main as 0.1.0.

## Covers

- packages/testing/spec/
- tooling/check/
