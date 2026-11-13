# @halonicjs/host-integration-sign-in

Owner: ravi · Layer: host · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The host's side of an integration's sign-ins: the `SignInTokens` the kit asks for, filled in from the permission sheet and the settings, and a sign-out that waits for a refresh in flight.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/host-integration-sign-in -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
