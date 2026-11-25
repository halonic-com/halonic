# @halonicjs/adapter-harness-opencode

Owner: owen · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Runs OpenCode as an agent's harness: finds it, checks its exact version, and points it at the Halonic bridge with its own network features off.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-harness-opencode -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- A new OpenCode version is its own security pull request with the version-bump checklist in `docs/adr/2026-11-24-opencode-harness-program.md`.
