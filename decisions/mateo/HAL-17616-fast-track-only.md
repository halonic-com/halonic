# Decision: the fast pool takes only pull requests labelled fast-track again, still never a bot's, on 16 fast slots

- Task: HAL-17616 (the board's decision on the task, 24 Nov)
- Approval: the board decided on HAL-17616 (24 Nov ~16:15 Spain) that the fast pool goes back to `fast-track` pull requests only, with the bot check kept and fast-1..16 as the normal pool; Liam signs this note in review, Julian checks C1–C8 on the task
- Kind: internal

## What changes

This narrows what HAL-17463 decided (`decisions/mateo/HAL-17463-fast-pool-all-prs.md`) and keeps
what HAL-17574 added (`decisions/mateo/HAL-17574-fast-pool-40.md`); those notes stay as they are.

- `.github/workflows/ci.yml`: in the seven copies of the routing expression, the fast part asks
  for the `fast-track` label again, next to everything it asks today: `CI_RUNNER_FAST` set, a head
  repository of `halonic-com/halonic`, an author that is a `User` whose login doesn't end in `[bot]`
  and isn't `dependabot`, `renovate` or `renovate-bot`. The comment at the top says so.
- The requirement `check.ci-self-hosted-routing`: the fast part becomes "a branch labelled
  `fast-track` whose author is a `User` … not a bot". Its two fast-pool examples change the same
  way: the negative one now names a pull request without the label, or a bot's, labelled or not.
  Its test builds the expression with the label condition between the repository and the author.
- `infra/ci-runner/vm/job-started.sh` (the hook, the real boundary): on the fast pool it refuses a
  pull request whose gate answer doesn't list the `fast-track` label (an exact, case-sensitive
  match; a missing or empty label list refuses), and keeps every other check, the author one
  included.
- `vm/halonic-ci-gate.sh`: the pull request query asks for `labels(first: 100) { nodes { name } }`
  and `author { __typename login }`.
- No change to memory admission (#5662, #5664), the floating CPU sets, `--cpu-shares`, the OOM
  priority, the gate socket's limits or the /24 network. The README documents fast-1..16 as the
  normal pool; the board stops fast-17..40 at deploy and their units stay installed.
- Tests (`infra/ci-runner/fast-pool.test.mjs`): the gate's sample answer carries the label; a new
  test refuses a same-repo pull request without it (empty, other or near-miss labels, a missing
  list); the bot tests now run with the label, so a labelled bot's pull request is refused; a
  labelled person's pull request is admitted; the gate's query test checks that it asks for both.

## Why

With every person's pull request on the fast pool (HAL-17463, HAL-17574) the CI VM's CPUs were
full on 24 Nov: 80 % busy, CPU pressure 63 %, run queue 316. Typecheck and test jobs that take
about 1 minute on an idle slot took 4-8 minutes, and pull request runs 40 minutes or more, while
GitHub's runners had a median of 18 that morning. 112 vCPUs can't carry every pull request and
the merge queue at once. The pool is fast when it isn't overloaded, so it goes back to the few
pull requests that carry `fast-track`. Bots stay refused even with the label, because a bot's pull
request must never get it (HAL-16033) and a label alone is one mistake away; the hook
checks both, not only `ci.yml`, because a pull request runs its own copy of `ci.yml`.

## Tests

No test was skipped or weakened. The test that admitted a pull request without a label now
admits one with it and checks that other labels beside it don't matter; the gate query test that
checked the labels were gone now checks they are asked for. One test is new (no label refused).
`node --test infra/ci-runner/hook.test.mjs`: 66 pass. The routing test: 5 pass.

## Covers

- check.ci-self-hosted-routing
- .github/
- tooling/check/
- infra/ci-runner/fast-pool.test.mjs
