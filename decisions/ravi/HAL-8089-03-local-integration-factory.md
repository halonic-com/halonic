# Decision: the sandbox CI job also builds the runner and runs the CLI fence tests

- Approval: Liam approved the plan on HAL-8089; the package owner (Liam) signs this note in review
- Kind: internal
- Signature: pending
- Task: HAL-8089

## What changes

The sandbox job in `.github/workflows/ci.yml` gains two steps (build the integration runner,
then `test:fence` for `apps/cli`) and watches `apps/cli/fence/` for changes. Nothing is
removed or loosened.

## Why

The end-to-end test starts a local integration in the real runner and the real sandbox. It
can only run where the sandbox exists, which is that job. The `apps/cli` fence tests were not
in any CI job before, so this also puts the existing harness fence test in CI.

## Covers

- .github/
