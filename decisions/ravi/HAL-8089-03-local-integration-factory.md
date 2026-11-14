# Decision: the sandbox CI job also builds the runner and runs the CLI fence tests

- Approval: Liam approved the plan on HAL-8089; the package owner (Liam) signs this note in review
- Kind: internal
- Task: HAL-8089

## What changes

In `.github/workflows/ci.yml`, in the sandbox job (both the Linux and the macOS variant):

- A new step builds the integration runner (`pnpm build` in `packages/adapters/integration-runner`) in front of the CLI fence tests.
- The existing step "Harness run through the fence" is renamed "CLI runs through the fence". It still runs `pnpm test:fence` in `apps/cli`; its comment now also names the local integration run.
- The `sandbox-fence` path filter, which already watches `apps/cli/fence/` and `apps/cli/src/local-harness-host`, also watches `open-local-integration`, `local-integration-machine`, `integration-connector-factory` and `workspace-engine` in `apps/cli/src`.

Nothing is removed or loosened.

## Why

Main already runs the `apps/cli` fence tests in that job. The new end-to-end test in them starts a local integration in the real runner and the real sandbox, so the runner must be built first, which is the new step. The filter change makes the fence jobs run when the code the end-to-end test covers changes, not only when the harness host or the fence folder does.

## Covers

- .github/
