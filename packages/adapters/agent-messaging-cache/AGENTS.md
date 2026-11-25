# @halonicjs/adapter-agent-messaging-cache

Owner: tomas · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The messaging cache on the local file system with Node: keeps what each AgentMessaging read gave, so an offline source still shows its items.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-agent-messaging-cache -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- Never keep a write to send later: a write goes straight to the live `AgentMessaging`, which sends it or refuses it (`agent-host.agent-messaging-cache`).
- Every cache file goes through `privateFileAt` (0600 in a 0700 folder), and the folder is refused inside a workspace.
