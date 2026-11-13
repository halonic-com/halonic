# Decision: four attack tests pin known gaps until a later fix

- Approval: HAL-8689 (the CTO decided there to keep the four `it.fails` tests, on the condition that the gaps they pin are fixed before any release that ships sign-ins)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:I1Nt1xe4tt+Q27CaH+ft3p+/7xD1DzL3tfQ6Sv1MG0cjcq73MalaDwT+RULCZN7OjSgRkEgi5WEsFMnaUXEUBQ==
- Task: HAL-8618

## What changes

Four tests in the new sign-in attack-test package are written with `it.fails`. Each pins a gap in
the sign-in code that stays open until a later fix, and each is a normal test today: it passes while
the gap exists and turns red as soon as the code closes it. Nothing is skipped, and no existing
test or requirement is weakened.

## Why

The tests record what the code should do, so the later fix has a test waiting for it. When a fix
lands, the matching test is changed to a plain `it`. The fixes are tracked in Paperclip and are
checked at the release review.

## Covers

- packages/testing/sign-in/src/flow-attacks.test.ts
- packages/testing/sign-in/src/token-attacks.test.ts
