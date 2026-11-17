# Decision: the sandbox remove dialog drops Cancel and asks for a choice first

- Task: HAL-11388
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11388 (wording from microcopy 13.1a and design check HAL-11370 item X1; small wording and detail of an approved screen is a team decision, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:i8VoXKGcrfcvip5icOHghY1W6rR5tFh9RIAASX8CelXg8dWYcyWwFXO1CHvWxFqtzMaoxJuZxLJZYL4lCV9JCA==

## What changes

The Remove sandbox setup dialog no longer has a third Cancel choice. Remove sandbox stays unavailable
until the user picks what happens to the contents, and the reason is shown under the choices.

The requirements `settings.sandbox-choice-flow` and `settings.sandbox-choice-view` gain these
cases. No test was weakened or skipped.

## Why

A Cancel radio made the dialog's confirm button do nothing when picked. The dialog already has a
close control, so the choice list only holds real outcomes.

## Covers

- settings.sandbox-choice-flow
- settings.sandbox-choice-view
