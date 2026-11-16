# Decision: delete the CLI and app run-facts parity test

- Task: HAL-10631
- Approval: Liam approves this note in review on HAL-10631
- Kind: internal

## What changes

`apps/cli/src/run-facts-parity.test.ts` is deleted. The CLI now reads a run's standing and the money rule from `@halonicjs/app`, so there is no second implementation to pin the app's answers against.

## Why

The file said so itself: it existed only until plan PR 8 (HAL-1301) switched the CLI over, and PR 8 was to delete it (decision HAL-6254). Its cases live on in two places: `packages/core/app/src/run-standing.test.ts` and the app's money tests cover the app's side, and the CLI's `listed-run.test.ts` and `run-failures.test.ts` still cover what the CLI prints, with one added case for a running run with an open approval.

## Tests

None skipped or weakened. The three differences the file pinned are now the app's answers: a running run with an open approval is Needs you, a half at the last decimal rounds up, and thousands are separated.

## Covers

- apps/cli/src/run-facts-parity.test.ts
