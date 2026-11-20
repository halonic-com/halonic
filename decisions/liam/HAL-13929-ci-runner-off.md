# Decision: the Cloudflare runner trial gets a new, unset switch, so the merge queue runs on GitHub's runners again

- Task: HAL-13929 (trial: HAL-13578, stop asked in HAL-13867 and HAL-13893)
- Approval: the stop rule of the trial (HAL-13578) and the board's ask to turn it off (HAL-13867); the security reviewer approves this note in review
- Kind: internal

## What changes

- In `.github/workflows/ci.yml`, `Fast gates` and `Typecheck, lint, test, build` ask for
  `cf-linux` only when the repository variable `CF_RUNNER_TRIAL` is `merge-queue`. They used to
  read `CF_RUNNER`. No `CF_RUNNER_TRIAL` variable exists, so both jobs run on `ubuntu-24.04` in
  the merge queue and on pushes to `main`, as before the trial.
- `infra/cf-runner/README.md` names the new variable.

## Why

Since about 22:00 UTC on 19 Nov the Cloudflare runner has started no containers. Every merge
group still asks for `cf-linux`, because `CF_RUNNER` is still set, so the queue (192 pull
requests) has merged nothing since 22:10. The trial's stop rule says to delete `CF_RUNNER`, but
only a person can delete a repository variable, and that ask has waited on the board since
22:45. This pull request's own merge group reads its own `ci.yml`, so it runs on GitHub's
runners and can merge, and every group rebuilt behind it does the same.

To turn the trial on again later: set `CF_RUNNER_TRIAL` to `merge-queue`. `CF_RUNNER` can be
deleted whenever someone gets to it; nothing reads it any more.

## Tests

No test was weakened or skipped. Only which runner two jobs ask for changes; the jobs are the same.

## Covers

- .github/workflows/ci.yml
