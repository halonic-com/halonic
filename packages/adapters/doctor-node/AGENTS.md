# @halonicjs/adapter-doctor-node

Owner: owen · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Node half of `halonic doctor`: the doctor service on a computer's parts (`DoctorMachine`), a workspace read as the doctor checks it, and the model servers on this computer it asks. The CLI builds the machine from this computer (`nodeDoctorMachine`); the agent host builds one from the parts it already runs. Words stay with each caller: this package returns `@halonicjs/app`'s facts and ids.

This package may change only through tasks that name it. Its public API is `src/index.ts`,
plus `src/doctor-workspace.ts` as `./workspace`: how the doctor reads a workspace, without Node, so
Studio's Check this computer reads the providers as `halonic doctor` does (HAL-13411); everything
else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-doctor-node -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
