# Decision: the CLI's edit distance test moves to std with the code it tested

- Task: HAL-14288
- Approval: Liam approves this note in review on HAL-14288 (one task per PR, HAL-11702)
- Kind: internal

## What changes

`apps/cli/src/near-match.ts` no longer has its own `editDistance`: the CLI now calls
`nearMatch` from `@halonicjs/std`, which uses std's `editDistance`. The CLI's `describe("editDistance")`
test in `apps/cli/src/near-match.test.ts` is deleted with the code it tested, so the file runs 3
tests instead of 4.

The three `cli.near-match` tests stay as they were, and "Did you mean" in the CLI behaves the same.

## Why

HAL-14288 keeps one "Did you mean" helper in our own util package instead of three copies. The
same cases (insertions, deletions, substitutions, swaps of neighbours, empty strings) are covered
by std's `std.near-match` tests in `packages/core/std/src/near-match.test.ts`, where the code now
lives. No test of the CLI's own behaviour was weakened or skipped.

## Covers

- apps/cli/src/near-match.test.ts
