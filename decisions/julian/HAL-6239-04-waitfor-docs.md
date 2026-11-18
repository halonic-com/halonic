# Decision: the fewer-expect requirement and the checks guide stop describing the removed vi.waitFor exception

- Task: HAL-6239
- Approval: `tooling/check/` is an own path of the guard, but not a trust root, so the CTO signs this `internal` note
- Kind: internal

## What changes

Text only. `check.guard-fewer-assertions` drops the sentence about skipping drops in tests that call `vi.waitFor`. Its five examples about that exception become one: a lower count in a test file that calls `vi.waitFor` is reported like any other. `docs/guides/checks.md` drops the exception's section and the pointer to it in the table, and says instead that `verifies()` counts only the passing attempt.

## Why

halonic#3356 (HAL-6453) removed the exception from `checkTestRuns`, after halonic#3318 made `verifies()` count only the attempt of a `vi.waitFor` retry that passed. The requirement and the guide still described the old exception, so they no longer matched what the guard does. The rule is stricter than the old text said, not looser.

## Tests

No test changes. The tests that verify `check.guard-fewer-assertions` already check the rule as it is now (halonic#3356); this pull request only brings its text in line with them.

## Covers

- tooling/check/
- check.guard-fewer-assertions
