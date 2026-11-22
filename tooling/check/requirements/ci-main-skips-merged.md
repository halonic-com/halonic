# check.ci-main-skips-merged

- Status: active
- Since: unreleased
- Source: HAL-15465 (board decision, 21 Nov)

When a push to `main` runs `.github/workflows/ci.yml`, the `merged` job shall look for a green merge-group run of the same commit, and each job on our own CI server that already passed there (`fast`, `build`, `trace`, `scaffold`, `e2e`, `docs`) shall skip; every other job, and every job on a pull request, in a merge group, or on a push without such a run, shall run as before.

## Examples

- Given a push to `main` whose commit passed its merge group with `fast`, `build` and `trace`,
  when CI runs,
  then those three jobs skip and the GitHub-hosted Linux jobs still run (the macOS and Windows jobs run hourly instead, `check.ci-desktop-hourly`).
- Given a push to `main` whose merge group skipped `e2e` because no Studio file changed,
  when CI runs,
  then `e2e` runs on the push.
- Given a push to `main` with no green merge-group run for its commit (a bypass merge, or the lookup fails),
  when CI runs,
  then every job runs and `ci-ok` is unaffected by the lookup.
- Given a pull request or a merge group,
  when CI runs,
  then the `merged` job is skipped and no job skips because of it.
