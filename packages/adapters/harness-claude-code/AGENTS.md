# @halonicjs/adapter-harness-claude-code

Owner: owen · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Runs Claude Code as an agent's harness: finds it, checks its version and sign-in, and points it at the Halonic bridge.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                                                | What it does                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm --filter @halonicjs/adapter-harness-claude-code test -- --maxWorkers=2`          | runs this package's tests                                       |
| `pnpm exec turbo run typecheck lint --filter=...[origin/main] --concurrency=2`         | checks the packages your change touches and the ones using them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones using them  |

Don't run `pnpm verify` here by default: CI runs the full suite (HAL-2418).

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
