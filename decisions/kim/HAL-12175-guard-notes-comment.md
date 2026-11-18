# Decision: the guard-notes comment says the check already blocks a merge

- Task: HAL-12175
- Approval: Liam approves this note in review on HAL-12175; Julian signs as second guardian
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:qMolLxg3IeKLy1A2nTfAk0A0KYRiTqrgr47uUxCs3R3bPq2vD/R8kj53vonBnQJzt/GQHegBqreV2t42FgSxBA==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:hOrAH2gCCnJqupB1O6jYaflbFXHBtC6tqv/D2CKySO0y3W+ZVOOpswlFgCBy9/pP8wNjHZZiur7MZVdJ4MY7Bg==

## What changes

The comment above the check step in `.github/workflows/guard-notes.yml` said the job blocks a
merge only once it is a required check next to `ci-ok`. It now says it blocks the merge today
(confirmed on HAL-12164). Only the comment changes. `guard-notes.yml` is a trust root, so the
note is `user-visible` and needs two guardians' signatures (check.guard-two-guardians).

## Why

A stale comment tells the next reader the guard is advisory when it isn't.

## Tests

No test was weakened or skipped. No code or workflow step changes.

## Covers

- .github/
