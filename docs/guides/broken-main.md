# When main is broken

Two CI jobs run on the merge base (the commit on `main` a pull request
branched from): `Merge base's tests` and the merge-base `guard`. Both install
with `pnpm install --frozen-lockfile`. If `main`'s own lockfile doesn't
install, every pull request would fail there, including the one that repairs
it.

## What CI does

Only when the install fails with a pnpm lockfile error
(`ERR_PNPM_*LOCKFILE*` or `OUTDATED_LOCKFILE`), `Merge base's tests` walks back
along `main`'s first-parent history, one commit at a time, to the newest
commit that installs. It stops after 20 commits and fails. That commit is the
baseline: its tests run, and the guard installs and compares against exactly
that commit. A `baseline-walked-back` warning names it.

- The baseline is always a commit on `main`. No pull-request code or lockfile
  runs in those jobs, so the trust boundary is unchanged.
- Network and registry errors never trigger the walk-back; they still fail.
- The guard keeps running against a real baseline, and `ci-ok` needs no
  exception.

## Repairing main

Open a normal pull request that fixes `pnpm-lock.yaml` (usually
`pnpm install --fix-lockfile`). Its own build job installs the repaired
lockfile with `--frozen-lockfile`, so a bad repair still fails.

If no commit within 20 of the merge base installs, the job fails with a
message pointing here. Then the board has to decide on an admin merge of the
repair.

## When main's tests fail

If the merge base installs but its own tests fail, `main` is red. CI on the
push to `main` already fails and reports it. In a pull request,
`Merge base's tests` then passes with a `merge-base-red` warning instead of
failing, so the pull request that repairs `main` can still pass `ci-ok`. The
results are packed and compared as usual. Every other job still runs the pull
request's own code, so a pull request that doesn't fix the break stays red in
`Typecheck, lint, test, build`.

Repair `main` with a normal pull request, reviewed and merged like any other.
