# Decision: move tests next to the code they test, to make room under the 500-line limit

- Approval: the board asked for this queue fix on HAL-14115 (rule 4 of the freeze on HAL-14331), and Liam approved #4221 on HAL-14524
- Kind: internal

## What changes

Three test files near the 500-line limit hand some of their tests to a new sibling file. No test is removed or changed, and each moved test keeps its `verifies()` ids:

- `apps/cli/src/commands/run/command.test.ts`: 26 → 18 tests. The 8 refusal tests move to `refusals.test.ts`, including the one that already skipped on Windows and as root (`it.skipIf(...)`, unchanged).
- `apps/studio/src/studio/start-studio.test.ts`: 19 → 17 tests. The 2 trust tests move to `start-studio.trust.test.ts`.
- `packages/studio/features/workflows/src/start/start-run.test.tsx`: 21 → 17 tests. The 4 dock tests move to `start-run-dock.test.tsx`.

## Why

Open pull requests add lines to these files, and a merge group fails when one of them crosses 500 lines (run 44804854618). The guard counts tests per file, so a test that moves files reads as one lost from the old file and, for the `skipIf`, as a new skip in the new one.

## Covers

- apps/cli/src/commands/run/command.test.ts
- apps/cli/src/commands/run/refusals.test.ts
- apps/studio/src/studio/start-studio.test.ts
- packages/studio/features/workflows/src/start/start-run.test.tsx
