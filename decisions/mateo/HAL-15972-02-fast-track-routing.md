# Decision: ci.yml sends fast-track pull requests from our own branches to our CI server's fast pool, switched off until CI_RUNNER_FAST is set

- Task: HAL-15972 (the board's decision on the task: "Yes go ahead", Timothy, 22 Nov; the team rule is on HAL-15971)
- Approval: the board approved fast-track pull request checks on our CI server (HAL-15972, Timothy, 22 Nov); Liam signs this note in review, Julian checks C1–C8 on the task
- Kind: internal

## What changes

- In `.github/workflows/ci.yml`, the eight jobs that can run on our own CI server (`build`, `e2e`,
  `scaffold` and `fast` on the large runner; `changes`, `trace`, `policy-base` and `docs` on the
  small one) get a fast part in front of their routing expression. A pull request goes to
  `CI_RUNNER_FAST` only when that variable is set, the pull request's head repository is
  `halonic-com/halonic`, and its event carries the `fast-track` label. Otherwise the expression is
  the same as before: merge groups and pushes to `main` per `CI_RUNNER_LARGE` / `CI_RUNNER_SMALL`
  and `CI_SELF_HOSTED_EVENTS`, everything else on `ubuntu-24.04`. `CI_RUNNER_FAST` is empty, so
  nothing changes for any run when this merges.
- The comments at the top of `ci.yml` and at the Turbo cache folder say what the fast pool is.
  The Turbo token step is unchanged: it already runs only off pull requests, so a fast-track job
  gets no remote cache token.
- The requirement `check.ci-self-hosted-routing` now describes the fast part, and its example
  "a pull request runs on `ubuntu-24.04`" becomes "a pull request without the label, from a fork,
  or with `CI_RUNNER_FAST` empty runs on `ubuntu-24.04`", plus an example for the fast pool.
- Its test builds the expression from the fast part and the pool part. The assertion "the
  expression doesn't contain `pull_request`" now applies to the pool part, which is where it
  always meant to hold; a new test checks that the fast part is one chain of all four conditions
  and the variable, with no `||`.

## Why

The board decided that fast-track pull requests from our own branches may run their Linux checks
on our server. This is only routing, not the boundary: a pull request's `ci.yml` is its own copy,
so the runner hook (separate `infra/ci-runner/` pull request) refuses a pull request on any pool
but the fast one, and on the fast one asks GitHub at job start whether the pull request is open,
from our own branch and labelled. Adding the label doesn't start a run: `ci.yml` has no
`labeled` trigger on purpose (it would restart every job), so the next push does. The one off
switch stays: clear `CI_RUNNER_FAST` and fast-track pull requests are back on `ubuntu-24.04`.

## Tests

No test was weakened or skipped. One assertion moved from the whole expression to its pool part
(above) and a test is new. On `main`'s `ci.yml`, the routing test fails.

## Covers

- check.ci-self-hosted-routing
- .github/
- tooling/check/
