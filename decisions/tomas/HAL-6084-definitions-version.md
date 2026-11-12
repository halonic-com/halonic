# Decision: the local executor asks for the definitions of the version a run records

- Requirements: `engine.run-records-its-version` (`packages/core/engine/requirements/run-records-its-version.md`)
- Task: HAL-6084, step 1 of the plan there (routines watch reads the live version)
- Approval: Liam approves this note in his review of this pull request on
  [HAL-6084](/HAL/issues/HAL-6084)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:860MLaDzBpJgP/XjmJV0Qg8mWkcOhNnJXEIR8xkfZpz9IUDlwy3EXTTeCyVU4GgDcy405flpiOFgbXCefi9WDQ==

## What changes

A run records the `version` its start request names (HAL-5173), but the local executor read its
definitions with `definitionsOf(hubId, workflowId)`, which knows nothing of that version. A host
that reads the live version at each start, as `halonic routines watch` will through
`LiveRoutines`, could then record one commit and run another, when a commit is made between the
two reads.

`LocalRunsOptions.definitionsOf` now gets the start request's `version` as a third argument, and
`LocalRuns.start` passes it. `engine.run-records-its-version` gains one sentence and one example
saying so. The hosts that exist today read one version only, ignore the argument and behave as
before. Nothing a user sees changes.

## Tests

No test was weakened. `local-runs-version.test.ts` gains two tests: the version a start names is
the one `definitionsOf` is asked for, and a start without one asks with none.

## Covers

- engine.run-records-its-version
