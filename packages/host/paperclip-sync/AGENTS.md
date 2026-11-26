# @halonicjs/host-paperclip-sync

Owner: tomas · Layer: host · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The engine's local copy of a messaging provider's lists: a store kept current from the provider's sync collections, and an AgentMessaging that answers reads from it, on Web-standard APIs only.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/host-paperclip-sync -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- The store holds only `AgentMessaging` port types. A provider converts its records before they reach a `SyncCollection`; never add a field for a provider's record, request or key.
- Files, folders and timers stay in the host that uses this package: persistence goes through `SyncPersistence`, and syncs are started by the caller.
