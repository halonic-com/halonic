# Decision: a child run's short id starts with its parent's short id

- Approval: option 2 on HAL-15744, decided by the team under HAL-2282 (Sofia); the package owner (Liam) approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6yjdlZyaiXLYP7aFGAOjBj7MCWvOVxBPsLfpkAm9RCp4qCHFk468e7DoJE+RBlwlR+khKzEr7FA0mnpS0gYKCw==

## What changes

`shortRunId` gives a child run the last 6 characters of the id before its first `.`, then the
child's own part: `…7k2m9p.3.1` reads `7k2m9p.3.1`, not `9p.3.1`. A top-level run's short id is
unchanged. `halonic runs show` and `runs send` take the new form, and a 6-character short id still
matches any run whose id ends in it, so an old `9p.3.1` still works.

- `app.run-short-id`: the sentence on what a short id is now covers a child run, and the lookup
  takes text with a `.` whose part before the first `.` has 6 characters. Three examples are added;
  none is removed or weakened ("the last 8 characters finds nothing" still holds).
- `runs.run-view.child-runs`: the example's short id for `run_a_01jd8q.7` changes from `jd8q.7` to
  `01jd8q.7`, the same rule applied; the requirement's sentence is unchanged.

Tests: in `step-events-model.test.ts` and `step-panel.test.tsx` the expected child link changes to
the new short id (`Run 01jd8q.4`, `Run 7k2m9p.13`). In `child-failure.test.ts` the `See that run`
line now expects the run's own short id followed by the child's part (`.<step>.0`), instead of any
6 characters. No test is skipped or removed.

## Why

A short id like `09.2.0` reads like a version number, and part of it comes from the parent's id, so
it means nothing on its own. `7k2m9p.3.1` reads as "a run under 7k2m9p": the same 6 characters
people already see on the parent's page and in `halonic runs`. Since #4769 and #4851 the CLI's
"See that run" line and Studio's **Open run** on a failed banner show a child's short id, so more
people see it. There is no length cap: nested runs are rare, and a cut-off id can't be typed back.

## Covers

- app.run-short-id
- runs.run-view.child-runs
- apps/cli/src/commands/run/child-failure.test.ts
- packages/studio/features/runs/src/run-view/step-events-model.test.ts
- packages/studio/features/runs/src/run-view/step-panel.test.tsx
