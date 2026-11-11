# @halonicjs/testing-harness-checks

Owner: owen · Layer: testing · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Manual checks, run by hand on a person's computer, of how the coding-agent harnesses sign in through the bridge and the sandbox.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/testing-harness-checks -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- A check prints only names, paths, hosts, status codes, counts and "present" or "absent". Never a header value, a token, an account or a program's output (HAL-1710).
- Tests use made-up tokens only, such as `made-up-sign-in`. Real sign-ins never go into tests, fixtures, recordings or logs.
- The checks run by hand (see README.md). CI runs only the tests, never a real harness.
