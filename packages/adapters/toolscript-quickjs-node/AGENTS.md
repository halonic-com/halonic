# @halonicjs/adapter-toolscript-quickjs-node

Owner: tomas · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Runs each ToolScript in the QuickJS isolate inside a `worker_threads` worker of its own, killed at its CPU limit. For now it takes no host functions (rule steps only); forwarding them over the worker's port is T9's, with S16's parent-side checks, and needs Julian's security review.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-toolscript-quickjs-node -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
