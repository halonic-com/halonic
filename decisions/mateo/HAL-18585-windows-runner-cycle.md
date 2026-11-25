# Decision: the fast job also runs the Windows runner's admission hook tests

- Task: HAL-18585 (PR 2 of the Windows runner VM, plan on HAL-18572)
- Approval: Liam approves this note in review on HAL-18585 (CI workflows are the guard's path; internal CI change, no board card)
- Kind: internal

## What changes

The `fast` job's "Infra tests" step in `.github/workflows/ci.yml` adds `infra/windows-runner/hook.test.mjs` to its `node --test` line. Nothing else in the workflow changes.

## Why

`infra/windows-runner/image/job-started.mjs` decides which jobs the self-hosted Windows runner accepts: only `push`, `schedule` or `workflow_dispatch` on `main` of `halonic-com/halonic`, never a pull request, a merge group, a branch or a fork. Its tests must run on every pull request so a change that loosens it fails CI. No check is removed or weakened; one test file is added to a step that already runs the other infra hook tests, and it takes under a second.

## Covers

- .github/
