# Decision: a pull request's CI run stops at its first failed job

- Approval: the board decided on HAL-10 (24 Nov 16:58 UTC, rule 2) that `ci-ok` on a pull request fails as soon as a required job fails; the work is HAL-17684, and Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7aC0yQooQ6d6oGJtrWEnSVHkz/cwTg/gFl9+Ok2SRWIfjaFxSw2YaawNmJ7CcI5w8gP56I2g+oklzzw1KhKLDg==

Until now the "Cancel the run on the first failure" job ran only in the merge
queue, so on a pull request `ci-ok` turned red only after every job had
finished (on #5692, 25 minutes after the first failure). It now runs on pull
requests too: the first failed job cancels the run, and `ci-ok` runs in that
cancelled run, fails, and names the job that failed first
(`check.ci-pr-fail-fast`).

Four jobs don't cancel a pull request's run, because another workflow re-runs
them alone once the cause is fixed (a title edit, a label, the live suites):
Fast gates, Leak guard, Coverage floors and the live cloud gate. After it
cancels a run, the watcher waits to be cancelled too, so "Re-run failed jobs"
starts it again with the failed and cancelled jobs. The requirement guard
doesn't run in a cancelled run, so it can't report "results are incomplete"
for jobs that were only cancelled. Merge groups keep their behaviour.

No trust root changes: `guard-notes.yml`, `tooling/check/src/guard/` and the
guard commands are untouched. The `tooling/check/` changes are a new
requirement file and its test.

## Covers

- .github/
- tooling/check/
