# Decision: one attack test pins a known gap until a later fix

- Approval: HAL-8689 (the CTO decided there to keep the `it.fails` tests, on the condition that the gaps they pin are fixed before any release that ships sign-ins)
- Kind: internal
- Task: HAL-8618

## What changes

One test in the new sign-in attack-test package is written with `it.fails`. It pins a gap in
the sign-in code that stays open until a later fix, and it is a normal test today: it passes while
the gap exists and turns red as soon as the code closes it. Nothing is skipped, and no existing
test or requirement is weakened.

## Why

The tests record what the code should do, so the later fix has a test waiting for it. When a fix
lands, the test is changed to a plain `it`. The fixes are tracked in Paperclip and are
checked at the release review.

## Covers

- packages/testing/sign-in/src/token-attacks.test.ts
