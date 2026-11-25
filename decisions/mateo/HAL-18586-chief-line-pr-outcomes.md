# Decision: the fast job also runs the pr-hooks receiver's tests

- Task: HAL-18586 (chief line pull request outcomes, webhook receiver)
- Approval: Liam approves this note in review on HAL-18586 (CI workflows are the guard's path; internal CI change, no board card)
- Kind: internal

## What changes

The `fast` job's "Infra tests" step in `.github/workflows/ci.yml` adds `infra/pr-hooks/receiver.test.mjs` to its `node --test` line and names the receiver in the step's title. Nothing else in the workflow changes.

## Why

`infra/pr-hooks/receiver.mjs` is a new inbound endpoint: it checks GitHub's webhook signature, refuses unsigned or wrongly signed deliveries, caps the body size and the request time, and forwards at most 30 facts a minute. Its tests must run on every pull request so a change that loosens any of that fails CI. No check is removed or weakened; one test file is added to a step that already runs the other infra tests, and it takes under a second.

## Covers

- .github/
