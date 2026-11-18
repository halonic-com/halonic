# Decision: the main CI test job uses the shared test timeout

- Task: HAL-12081
- Approval: Paperclip task HAL-12081 (Liam reviews the code of this pull request there)
- Kind: internal

The `Typecheck, lint, test, build` job ran `turbo run test` without `HALONIC_TEST_TIMEOUT`, so its
tests ran at Vitest's 5 s default while the other test jobs use 30 s. The job now sets
`HALONIC_TEST_TIMEOUT=30000` on that step, like they do. No other workflow change.

## Covers

- .github/
