# Decision: everything the verdict gate runs is out of the routine reviewer's reach

- Task: HAL-20010
- Approval: Liam's review of #6641 (HAL-19992) named this as a condition for the flag; Liam reviews and signs this note
- Kind: internal

## What changes

1. Moved into `tooling/paperclip/src/verdicts/`, unchanged, with the old files re-exporting them so no other caller changes:
   - `verdicts/github-read.ts` (new): `byReviewer` and `everyPage` from `pr-watcher/github.ts`, `branchPath` from `pr-tools/pr-status.ts`.
   - `verdicts/compare.ts` (new): `CompareFile`, `sameChanges` and `changeIdOf` (the change fingerprint) from `pr-watcher/rebase-only.ts`.
   `verdicts/pull-facts.ts` and `pr-tools/approvals.ts` import them from there, so the gate no longer loads `pr-status.ts`, `rebase-only.ts`, `pr-watcher/github.ts` or what they import at run time.
2. Added to `routineExcludedFolders` what the gate still runs outside `verdicts/` and shares with other tools: `pr-tools/approvals.ts` (which approvals count), `pr-tools/manifests.ts`, the `reviewer-paths*` files (who reviews, and the routine rules themselves), `routing.ts` and `task-tools/input.ts` (`ToolInputError`).
3. `verdicts/imports.test.ts` follows every run-time import from the files in `verdicts/` and fails if one reaches a file `isRoutineExcluded` doesn't cover. Requirement `paperclip.verdicts-gate` gets one paragraph for it.

## Why

Liam's review of #6641: the gate under `verdicts/` still called code a routine review may change, so a routine pull request could change what the gate counts. Moving the small helpers keeps the exclusion list short; the shared files stay where their other callers are and are excluded instead.

## Limits

- Type-only imports (`GitHubGet`, `PullDetails`, `CopyAgent`) stay; TypeScript erases them, so they carry no behaviour.
- `merge-control/facts-patch-ids.ts` still imports `branchPath` and `changeIdOf` through the re-exports; they now resolve to `verdicts/`, so the Merger runs the protected code too.
- Moving `approvals.ts` and `manifests.ts` into `verdicts/` would touch about 20 callers; excluding them does the same job.

## Covers

- paperclip.verdicts-gate

## Tests

No test was skipped or weakened. New: `src/verdicts/imports.test.ts`. With `task-tools/input.ts` taken off the list it fails and names that file.
