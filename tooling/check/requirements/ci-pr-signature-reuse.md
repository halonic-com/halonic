# check.ci-pr-signature-reuse

- Status: active
- Since: unreleased
- Source: HAL-17896 (the CI part of HAL-17893, Liam's flow for signing with the review)

When a pull request's new commit only adds, removes or replaces `- Signature: ed25519:` lines in the branch's own decision note, is the only commit on top of the previous head, and the previous head's full run of `.github/workflows/ci.yml` passed every job but `ci-ok`, the fail-fast watcher and the requirement guard's two jobs (its file checks and the full guard), the run shall skip the build shards, the merge base's tests and every area job, and the requirement guard shall run on the new head with the previous run's test results and merge base; any other push, a re-run, a draft, any doubt or the repo variable `CI_PR_SIGNATURE_REUSE` set to `off` shall run every job as before.

## Examples

- Given a pull request whose run failed only the requirement guard ("the note has no signature line"),
  when the reviewer pushes one commit that adds the signature line,
  then the build, the merge base's tests and the area jobs skip, the guard runs on the new head with that run's results and passes, and `ci-ok` is green.
- Given a trust-root change with one signature,
  when the second guardian pushes their line under it,
  then that run reuses the same results again.
- Given a push that also changes another line of the note, another file, or rebases the branch,
  when CI runs,
  then every job runs.
- Given a previous run in which another job failed or was cancelled, or whose results have expired,
  when the signature-only push runs,
  then every job runs.
- Given a merge group or a push to `main`,
  when CI runs,
  then `signature-reuse` is skipped and no job skips because of it.
