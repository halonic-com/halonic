# Decision: a package may run its tests as parts and merge them in `test`

- Approval: HAL-17930 (routed from the board's merge-time report on HAL-17891); Liam approves this note in review
- Kind: internal

## What changes

- The packages check (`tooling/check/src/lib/coverage.ts`) still requires a package's `test` script to be exactly `vitest run`, with one other exact form allowed: `vitest run --config vitest.merge.config.ts --merge-reports=test-results/blob`. No flags may be added to either.
- The CLI (`apps/cli`) uses that form. `test:part-1` and `test:part-2` each run half the test files with `--shard` and write a blob report. `test` depends on both parts and merges the reports.

## Why

The CLI's one test task took about 235 s in CI and was the whole critical path of the apps-host shard. Most of that time is each file starting up, not the tests themselves, so two parts running at once roughly halve it.

## What stays guarded

- The coverage floor still comes from the shared preset: `vitest.merge.config.ts` builds on the package's `vitest.config.ts`, which this change doesn't touch. The merge checks the floor for both parts together.
- A part has no floor of its own, because half the tests can't meet it. The merge fails when a test file ran in neither part, so a missing part can't pass quietly.
- No test is removed or skipped: 2,171 tests in 281 files before and after.

## Tests

`tooling/check/src/test/coverage.test.ts`: the merge form passes, and the merge form with an extra `--coverage.enabled=false` fails.

## Covers

- tooling/check/
