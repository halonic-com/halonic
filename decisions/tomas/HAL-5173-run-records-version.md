# Decision: a run records which version of the workspace it read

- Requirements: `events.run-log-contract` (`packages/core/events/requirements/run-log-contract.md`),
  `events.run-started-version`, `engine.run-records-its-version`, `app.run-records-its-version`
- Task: HAL-5173, step 6a of HAL-3246 (the engine side of `runs.run-view.live-or-saved`)
- Approval: Liam approves this note in his review of this pull request on
  [HAL-5173](/HAL/issues/HAL-5173)
- Kind: internal

## What changes

`run.started` gains an optional `version`: which version of the workspace the run read, either
`{ reads: "live-version", commit, versionDate }` or `{ reads: "saved-files" }`. Until now a run
recorded only `definitionsVersion`, the hash of its kept definitions, so the Studio couldn't say
whether a run ran the live version or the saved files. `versionDate` is the date the version was
made (its commit's date), not the run's start, as Liam's note on the plan asks, so the run view
can say "the version of <date>". A log without `version` reads as "not recorded", never as the
saved files.

`events.run-log-contract`: its third example listed "the twenty-one fields that come with the
engine". It now lists twenty-two, with `run.started.version` and its requirement
`events.run-started-version`. No reference field changes, and logs without `version` read as
before.

Three requirements are new: `events.run-started-version` (the event field),
`engine.run-records-its-version` (the engine records the start's `version`, and a child run its
parent's) and `app.run-records-its-version` (`runVersionOf`, `WorkflowRuns.startRun` and the
routine scheduler pass it in).

`RunState` gains `version`, so the engine's snapshot version moves from 9 to 10: older snapshots
are folded from their logs again.

## Tests

No test was weakened. The `run.started` type test gains the optional field, marked as added after
the reference. The run-state fold test's expected state gains `version: null`. The new
requirements have their own tests in `run-started-version.test.ts`,
`local-runs-version.test.ts` and `run-version.test.ts`.

## Covers

- events.run-log-contract
- events.run-started-version
- engine.run-records-its-version
- app.run-records-its-version
- packages/core/events/src/run-event.test.ts
- packages/core/engine/src/kernel/run-state.test.ts
