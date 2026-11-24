# Decision: every pull request a person opens from our own branches runs its Linux checks on the fast pool, without the fast-track label; bots stay on GitHub's runners

- Task: HAL-17463 (the board's decision on the task, 24 Nov)
- Approval: the board decided on HAL-17463 (24 Nov) that every same-repo pull request runs its Linux checks on the fast pool, bots refused, 24 fast slots; Liam signs this note in review, Julian checks C1–C8 on the task
- Kind: internal

## What changes

- `.github/workflows/ci.yml`: in the seven copies of the routing expression, the fast part no
  longer asks for the `fast-track` label. It asks that the pull request's author is a `User`
  whose login doesn't end in `[bot]` and isn't `dependabot`, `renovate` or `renovate-bot`. It
  still asks for `CI_RUNNER_FAST` and a head repository of `halonic-com/halonic`. Forks and bots'
  pull requests stay on `ubuntu-24.04`. The comment at the top says so.
- The requirement `check.ci-self-hosted-routing` describes the new fast part: "labelled
  `fast-track`" becomes "whose author is a `User` … not a bot". Its two fast-pool examples change
  the same way. Its test builds the expression from the new conditions and checks that the label
  condition is gone.
- `infra/ci-runner/vm/job-started.sh` (the hook, the real boundary): on the fast pool it no
  longer asks for the label, and refuses a pull request whose author is missing, isn't a `User`,
  or has a bot's login (the same list). Everything else stays: open, not cross-repository, head
  repository owned by `halonic-com`, still at the event's commit, fail closed on any doubt.
- `vm/halonic-ci-gate.sh`: the pull request query asks for `author { __typename login }` instead
  of the labels.
- `vm/halonic-ci-gate-fast.socket`: 24 connections (one per fast slot), at most 48 a minute
  (2880 an hour, against an expected 540 and the read-only token's 5000).
- `vm/halonic-runner-slot.sh`: new slots `fast-11` … `fast-24`, 4 CPUs each (two whole cores,
  shared with large slots, none with another new fast slot), 4 GB growing to 12 GB, the same
  reserve check, no twin rule. `fast-1` … `fast-10` and their twin rule are unchanged.
- Tests (`infra/ci-runner/`): the two label tests become tests that a bot's or a missing author's
  pull request is refused; a pull request without a label is admitted; the socket's limits, the
  new slots' sizes, CPU sets and the absence of a twin rule are checked.

## Why

GitHub's runners were the main brake on output (p90 pull request run about 23 minutes) while our
CI VM sat mostly idle. Anyone who can push a branch to `halonic-com/halonic` already has write
access, so the risk is our own unreviewed code, which the fast pool was built to contain (gVisor,
its own network, read-only cache snapshots, no Turbo write token, no secrets). The label was a
human gate in front of that containment; the containment now has to hold on its own. Bots are
refused in the hook, not only in `ci.yml`, because a pull request runs its own copy of `ci.yml`.

## Tests

No test was skipped. Two tests about the label are replaced by tests about the author, because
the label no longer decides; one test about the new slots' CPUs is new.
`node --test infra/ci-runner/hook.test.mjs`: 56 pass. The routing test: 5 pass.

## Covers

- check.ci-self-hosted-routing
- .github/
- tooling/check/
- infra/ci-runner/fast-pool.test.mjs
- infra/ci-runner/hook.test.mjs
