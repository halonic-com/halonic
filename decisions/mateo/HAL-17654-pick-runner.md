# Decision: a pull request uses the fast pool only while the pool has room, picked once per run

- Task: HAL-17654 (the board's decision on the task, 24 Nov)
- Approval: the board decided on HAL-17654 (24 Nov ~16:35 Spain) that a first job picks the fast pool only when it has enough idle runners, with `CI_FAST_MIN_IDLE` and `CI_FAST_SCOPE` as repo variables and the CI VM's gate as the real control; Liam signs this note in review, Julian checks C1–C8 on the task (the job adds a token)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BB3OzZ979bchgUfYNj1d2BCqCT6Aa+D/Hq0SRPfICkbLh5oEV9qRRhAV2b6ygMAXyW2aA5KywdxL+L1+nQG2CQ==

## What changes

This builds on HAL-17616 (`decisions/mateo/HAL-17616-fast-track-only.md`), which stays as it is.

- `.github/workflows/ci.yml`: a new first job, `pick-runner`, on `ubuntu-24.04`. It runs only for
  a pull request a person opened from a `halonic-com/halonic` branch while `CI_RUNNER_FAST` is set;
  forks and bots skip it. It mints a token from the `CI_PICK_APP_CLIENT_ID` / `CI_PICK_APP_KEY`
  GitHub App with only `permission-organization-self-hosted-runners: read`, then runs
  `infra/ci-runner/pick-runner.mjs`, which answers `fast=true` or `fast=false`. In the seven copies
  of the routing expression, the `fast-track` label condition becomes
  `needs.pick-runner.outputs.fast == 'true'`; the repository, author and bot conditions stay. The
  seven jobs need `pick-runner`; `policy-base`, the one without `!cancelled()`, gets it, so a
  skipped `pick-runner` (every merge group and push) doesn't skip it. The infra test step also runs
  `pick-runner.test.mjs`.
- `infra/ci-runner/pick-runner.mjs` (new): out of scope (no `fast-track` label while
  `CI_FAST_SCOPE` isn't exactly `all`) answers GitHub's runners without calling the API. Otherwise
  it lists `CI_RUNNER_FAST`'s runner group and counts the runners that are `online`, not `busy` and
  carry all of its labels; at least `CI_FAST_MIN_IDLE` (14 when unset, 1 to 100) answers the fast
  pool. No token, no single group of that name, any status but 200, an odd body, more than 10
  pages, a 10 s time-out or an unreadable setting all answer GitHub's runners, never our pool. The
  step never fails.
- The requirement `check.ci-self-hosted-routing`: the fast part says "`pick-runner` answered
  `fast`" instead of "labelled `fast-track`", and a sentence says when `pick-runner` runs and what
  it answers. Two examples change the same way and two are new (an unlabelled pull request under
  `fast-track` never asks GitHub; 13 idle runners or a failed call answers GitHub's runners).
- `infra/ci-runner/vm/job-started.sh` (the hook, the real boundary): the `fast-track` label is
  still required unless the fast pool's own `pool.conf` says `PR_SCOPE="all"` (the hook drops
  quotes, so `PR_SCOPE=all` counts too). A missing line or any other value keeps it required. Every other check stays, bots and forks included.
  `vm/pool-fast.conf` ships `PR_SCOPE="fast-track"`.

**Which control follows the scope:** a VM-side setting, not the repo variable. The hook never sees
the repo's variables, and a pull request runs its own copy of `ci.yml`, so only a root-owned file
on the VM can widen what the hook admits. To go to `all`, the VM's `PR_SCOPE` changes first, then
`CI_FAST_SCOPE`. With the two out of step the safe side wins: the hook refuses an unlabelled pull
request the picker sent.

**The token:** not the runners' own App (`halonic-ci-runners`), whose key can register runners
and so take our jobs; a repository secret can be read by any workflow on our own branches. A new
App, `halonic-ci-pick`, with one permission, Organization → Self-hosted runners: Read-only, no
repository permissions. It must never get a second permission or repository access (Julian,
HAL-17693): its key is readable by any workflow on our own branches, so a permission added later
goes to every writer. The board creates it and sets `CI_PICK_APP_CLIENT_ID` (a variable, the
client ID isn't secret) and `CI_PICK_APP_KEY` (an Actions secret, so fork and Dependabot runs never
get it). The minted token lasts at most an hour and is revoked when the job ends. Until both exist,
every pull request runs on GitHub's runners, so they come before the merge.

**Two runs at once:** both can count the same idle runners. The margin (14 for about 11 Linux
jobs) covers part of it. In the worst case, some jobs wait in GitHub's queue until a fast slot
frees up. Nothing fails, and a run never splits between pools. A re-run of failed jobs reuses its
run's first answer and can wait the same way.

## Why

On 24 Nov the fast pool was quicker than GitHub's runners only while it wasn't crowded: a
typecheck or test job took about 1 minute on an idle slot and 4-8 minutes with the CI VM's CPUs
full (HAL-17616). A job's runner is fixed when GitHub creates it, so the choice has to be made once,
at the start of the run, from how many slots are free right then.

## Tests

No test was skipped or weakened. The routing test's expression has the picker's condition where
the label's was, and two tests are new: every server job needs `pick-runner` and keeps
`!cancelled()`, and `pick-runner` runs only for a person's own-branch pull request, with a
read-only token and `continue-on-error`. `infra/ci-runner/pick-runner.test.mjs` (new, 8 tests): the
threshold, the runner count, the scope, no API call out of scope, every API failure and every bad
setting answering GitHub's runners, and the step's output. `infra/ci-runner/fast-scope.test.mjs`
(new, 4 tests, imported by `hook.test.mjs`): without `PR_SCOPE="all"` the label is required;
with it an unlabelled person's pull request is admitted and bots, forks, closed and moved-on pull
requests are still refused. `node --test infra/ci-runner/hook.test.mjs
infra/ci-runner/pick-runner.test.mjs`: 78 pass. The routing test: 7 pass.

## Covers

- check.ci-self-hosted-routing
- .github/
- tooling/check/
- infra/ci-runner/hook.test.mjs
