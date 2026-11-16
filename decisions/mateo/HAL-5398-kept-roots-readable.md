# Decision: the sandbox choice lists a backend's own residuals next to those of the trust check

- Approval: HAL-5398 (https://paperclip.halonic.com/HAL/issues/HAL-5398), approved by the board; the package owner (Liam) signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gMwcFGDTMAaMvDuyrEzmzRAdTDHPbEj/ACrSuJk9WtCYeEwBiNmtuKE5QRXMXQkmvJ9/kMzcCF/lJiMKDsAjAg==
- Task: HAL-5398

## What changes

The requirement `app.sandbox-choice` gains one example: when a backend's `ok` check brings
residuals of its own (today `kept-roots-readable`), they are listed next to those of the trust
check, and neither replaces the other. No test was weakened or skipped.

## Why

The residual `kept-roots-readable` comes from the backend's check, not from the trust check, and
was not listed anywhere a person could see it.

## Covers

- app.sandbox-choice
