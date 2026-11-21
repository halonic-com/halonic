# check.main-failures

- Status: active
- Since: unreleased
- Source: HAL-12539 (step 3 of HAL-5327, option A)

When the nightly reads the newest finished push run of CI on main, `main-failures` shall report, for each area of `docs/guides/area-owners.md`, the failed jobs that belong to it: a job by its row in the CI jobs table (a matrix job by its name before the brackets), a job that tests every package, or one of its shards (its name followed by the shard in brackets), by the folder of each package whose task failed in its log, and any other job, or one whose log names no package, to the shared-code area. It shall mark a job as failing the second night in a row when the same job failed in the same area on the newest run at least 20 hours older.

## Examples

- Given a failed job "Agent host executable (macOS)", then it is reported under Adapters.
- Given a failed "Typecheck, lint, test, build" whose log has `command (<workspace>/packages/studio/features/source-control) … exited (1)`, then it is reported under Studio.
- Given a failed shard "Typecheck, lint, test, build (adapters)" whose log has `command (<workspace>/packages/studio/features/source-control) … exited (1)`, then it is reported under Studio.
- Given a failed "Typecheck, lint, test, build" whose log names no package, then it is reported under Shared code and everything else.
- Given a failed ci-ok and no other failed job, then no area is failing.
- Given "Sandbox fence (bubblewrap)" failed on the newest run and on the run of the night before, then it is marked as the second night in a row.
