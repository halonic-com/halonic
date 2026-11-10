# When main is broken

Two CI jobs run on the merge base (the commit on `main` a pull request
branched from): `Merge base's tests (no cache)` and the guard job
`Requirements and the requirement guard (merge base's copy)`. Both run on
pull requests only, not in the merge queue, and both are skipped for a
docs-only pull request. Both install with `pnpm install --frozen-lockfile`. If `main`'s own lockfile doesn't
install, or its own tests fail, every pull request would fail there,
including the one that repairs it.

## When main's lockfile doesn't install

Only when the install fails with a pnpm lockfile error
(`ERR_PNPM_*LOCKFILE*` or `OUTDATED_LOCKFILE`), `Merge base's tests (no cache)` walks back
along `main`'s first-parent history, one commit at a time, to the newest
commit that installs. It stops after 20 commits and fails. That commit is the
baseline: its tests run, and the guard installs and compares against exactly
that commit. A `baseline-walked-back` warning names it.

- The baseline is always a commit on `main`. No pull-request code or lockfile
  runs in those jobs, so the trust boundary is unchanged.
- Network and registry errors never trigger the walk-back; they still fail.
- The guard keeps running against a real baseline, and `ci-ok` needs no
  exception.

## Repairing the lockfile

Open a normal pull request that fixes `pnpm-lock.yaml` (usually
`pnpm install --fix-lockfile`). Its own build job installs the repaired
lockfile with `--frozen-lockfile`, so a bad repair still fails.

If no commit within 20 of the merge base installs, the job fails with a
message pointing here. Then the board has to decide on an admin merge of the
repair.

## When main's tests fail

If the merge base installs but its own tests fail, `main` is red. CI on the
push to `main` already fails and reports it. In a pull request,
`Merge base's tests (no cache)` then walks back along `main`'s first-parent history to
the newest commit whose `push` CI run passed, at most 20 commits back from the
merge base. That commit is the baseline: it's installed and its tests run
without a cache, and the guard installs and compares against exactly that
commit. A `baseline-walked-back` warning names it.

- The baseline is still a commit on `main`, found with
  `git rev-list --first-parent` and checked against the `push` runs of
  `ci.yml` on `main`. The lookup only reads, so the trust boundary is
  unchanged.
- The pull request that repairs `main` can pass `ci-ok`, and the guard
  compares it against a green baseline, not against `main`'s red results.
- Every other job still runs the pull request's own code, so a pull request
  that doesn't fix the break stays red in `Typecheck, lint, test, build`.

If no commit within 20 has a green `push` run, or the green commit's tests
fail when they run again here, the job fails with a message pointing here.
Rerun the job once in case a test was flaky. If it still fails, the board has
to decide on an admin merge of the repair.

Repair `main` with a normal pull request, reviewed and merged like any other.
